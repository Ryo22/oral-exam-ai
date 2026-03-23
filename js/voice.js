window.appVoice = function() {
  return {
    async _startMicCapture() {
      try {
        this.voiceMicStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = this.voiceAudioCtx.createMediaStreamSource(this.voiceMicStream);
        // ScriptProcessor is deprecated but universally supported; replace with AudioWorklet in future
        const processor = this.voiceAudioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (this.voiceMuted) return; // muted — don't send audio
          if (this.liveWs && this.liveWs.readyState === WebSocket.OPEN && this.liveStatus !== 'ai_speaking') {
            const pcm16 = this._float32ToPCM16(e.inputBuffer.getChannelData(0));
            const b64 = this._bufToBase64(pcm16.buffer);
            this.liveWs.send(JSON.stringify({
              realtime_input: { media_chunks: [{ data: b64, mime_type: 'audio/pcm;rate=16000' }] }
            }));
          }
        };
        source.connect(processor);
        processor.connect(this.voiceAudioCtx.destination);
        this.liveStatus = 'listening';
      } catch(err) {
        alert('マイクへのアクセスが許可されていません。\nブラウザの設定でマイクを許可してください。\n\nエラー: ' + err.message);
        this.liveStatus = 'error';
        this.stopLiveSession();
      }
    },

    // ---- Play queued audio chunks (PCM 24kHz) ----
    _playNextAudioChunk() {
      if (this.voiceAudioQueue.length === 0) {
        this.voiceIsPlaying = false;
        if (this.liveStatus === 'ai_speaking') this.liveStatus = 'listening';
        return;
      }
      this.voiceIsPlaying = true;
      this.liveStatus = 'ai_speaking';

      if (!this.voicePlayCtx || this.voicePlayCtx.state === 'closed') {
        this.voicePlayCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        this.voiceScheduledTime = this.voicePlayCtx.currentTime;
      }
      // Resume suspended context (browsers suspend AudioContext until user interaction)
      if (this.voicePlayCtx.state === 'suspended') {
        this.voicePlayCtx.resume().catch(() => {});
      }

      // Drain all queued chunks and schedule them back-to-back
      while (this.voiceAudioQueue.length > 0) {
        const b64 = this.voiceAudioQueue.shift();
        const buf = this._base64ToBuf(b64);
        const i16 = new Int16Array(buf);
        const f32 = new Float32Array(i16.length);
        for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;

        // OLA time-stretch: change speed WITHOUT changing pitch
        const resampled = this._timeStretch(f32, this.voicePlaybackRate);
        const ab = this.voicePlayCtx.createBuffer(1, resampled.length, 24000);
        ab.getChannelData(0).set(resampled);
        const src = this.voicePlayCtx.createBufferSource();
        src.buffer = ab;
        // playbackRate stays 1.0 — pitch is preserved by resampling
        src.connect(this.voicePlayCtx.destination);
        const startAt = Math.max(this.voiceScheduledTime, this.voicePlayCtx.currentTime);
        src.start(startAt);
        this.voiceScheduledTime = startAt + ab.duration;
      }

      // Poll for more chunks while playing, then transition back to listening
      const checkDone = () => {
        if (!this.voicePlayCtx) return;
        if (this.voiceAudioQueue.length > 0) {
          this._playNextAudioChunk(); return;
        }
        const remaining = (this.voiceScheduledTime - this.voicePlayCtx.currentTime) * 1000;
        if (remaining > 50) {
          setTimeout(checkDone, Math.min(remaining, 200));
        } else {
          this.voiceIsPlaying = false;
          if (this.liveStatus === 'ai_speaking') this.liveStatus = 'listening';
        }
      };
      setTimeout(checkDone, 100);
    },

    // ---- Pitch-preserving time stretch via OLA (Overlap-Add) ----
    // Repositions Hann-windowed frames along the input time axis at rate=speed,
    // but writes them to output at a fixed hop — duration changes, pitch stays same.
    _timeStretch(f32, speed) {
      if (Math.abs(speed - 1.0) < 0.01) return f32;
      const FRAME = 1024;   // window size (samples)
      const HOP   = 512;    // output hop = FRAME/2 (50% overlap)
      const outputLen = Math.max(FRAME, Math.round(f32.length / speed));
      const out  = new Float32Array(outputLen);
      const norm = new Float32Array(outputLen);
      // Pre-compute Hann window
      const hann = new Float32Array(FRAME);
      for (let i = 0; i < FRAME; i++) {
        hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FRAME - 1)));
      }
      // Overlap-add: for each output frame position, read from scaled input position
      for (let outPos = 0; outPos + FRAME <= outputLen; outPos += HOP) {
        const inPos = Math.round(outPos * speed);
        if (inPos + FRAME > f32.length) break;
        for (let i = 0; i < FRAME; i++) {
          const w = hann[i];
          out[outPos + i]  += f32[inPos + i] * w;
          norm[outPos + i] += w * w;  // power normalization
        }
      }
      // Normalize accumulated frames
      for (let i = 0; i < outputLen; i++) {
        if (norm[i] > 1e-6) out[i] /= norm[i];
      }
      return out;
    },

    // ---- Reconnect Live session (apply voice / silence delay changes mid-exam) ----
    async reconnectLiveSession() {
      const isActive = ['listening','ready','ai_speaking'].includes(this.liveStatus);
      // Save last AI message so we can resume naturally after reconnect
      const lastAiMsg = [...this.messages].reverse().find(m => m.role === 'assistant');
      this._reconnectContext = lastAiMsg
        ? `音声設定変更のため再接続しました。試験を継続してください。あなたの直前の発言は「${lastAiMsg.content.slice(0, 200).replace(/\n/g, ' ')}」です。その続きから試験を再開してください。`
        : null;
      this.stopLiveSession();
      await new Promise(r => setTimeout(r, 400));
      await this.initLiveSession();
    },

    // ---- Tear down Live session ----
    // Convert markdown to safe HTML for display in chat bubbles
    parseMarkdown(text) {
      if (!text) return '';
      if (typeof marked === 'undefined') return text;
      return marked.parse(text);
    },

    // Returns true if string contains Japanese/CJK characters
    _hasJapanese(s) {
      return /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(s);
    },

    // Strip AI internal commentary (English meta-sentences) from the final AI turn text.
    // Splits into sentence chunks and keeps only those containing Japanese characters.
    _cleanAiText(text) {
      if (!text) return text;
      // Remove **bold** markers first
      let t = text.replace(/\*\*([^*]+)\*\*/g, '$1');
      // Split on sentence-ending punctuation (English . ! ? or Japanese 。！？)
      // followed by a space+capital or newline
      const segments = t.split(/(?<=[.!?。！？])\s+(?=[A-Z\u3000-\u9FFF\uF900-\uFAFF])/);
      const hasAnyEnglishOnly = segments.some(s => s.trim().length > 15 && !this._hasJapanese(s));
      // Only filter if there are clearly English-only segments to remove
      if (hasAnyEnglishOnly) {
        const jpSegments = segments.filter(s => this._hasJapanese(s));
        if (jpSegments.length > 0) return jpSegments.join(' ').trim();
      }
      return t.trim();
    },

    // Real-time version: lighter filter for streaming display (incomplete sentences OK)
    _cleanAiTextRealtime(text) {
      if (!text) return '';
      // Find the last Japanese character position — everything before a long
      // English-only stretch at the START can be trimmed.
      // Simple heuristic: take only the Japanese-containing portions
      const t = text.replace(/\*\*([^*]+)\*\*/g, '$1');
      // Remove leading English paragraphs (before first Japanese character)
      const firstJapIdx = t.search(/[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/);
      if (firstJapIdx > 60) {
        // There's a long English preamble — start from first Japanese char (at sentence start)
        const beforeJap = t.substring(0, firstJapIdx);
        // Find last sentence boundary before first Japanese char
        const lastBound = Math.max(
          beforeJap.lastIndexOf('. '),
          beforeJap.lastIndexOf('! '),
          beforeJap.lastIndexOf('? '),
          beforeJap.lastIndexOf('\n')
        );
        return t.substring(lastBound > 0 ? lastBound + 2 : firstJapIdx).trim();
      }
      return t.trim();
    },

    stopLiveSession() {
      if (this.voiceAudioCtx) { try { this.voiceAudioCtx.close(); } catch(e){} this.voiceAudioCtx = null; }
      if (this.voicePlayCtx)  { try { this.voicePlayCtx.close();  } catch(e){} this.voicePlayCtx = null; }
      if (this.voiceMicStream) { this.voiceMicStream.getTracks().forEach(t => t.stop()); this.voiceMicStream = null; }
      if (this.liveWs) { try { this.liveWs.close(); } catch(e){} this.liveWs = null; }
      this.liveStatus = 'idle';
      this.liveErrorMsg = '';
      this.voiceAudioQueue = [];
      this.voiceIsPlaying = false;
      this.voiceCurrentAiText = '';
      this._pendingUserText = '';
      this.voiceMuted = false;
      this.showVoiceSettings = false;
    },

    async handleDocumentUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) { alert('ファイルサイズは5MB以下にしてください。'); return; }

      this.settings.documentName = file.name;

      if (file.type === 'application/pdf') {
        // Use Gemini Files API approach: read as base64 and send inline
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target.result.split(',')[1];
          // Extract text via Gemini
          try {
            const endpoint = `${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`;
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  role: 'user',
                  parts: [
                    { inline_data: { mime_type: 'application/pdf', data: base64 } },
                    { text: 'このPDFの全テキスト内容をそのまま抽出してください。整形不要。' }
                  ]
                }]
              })
            });
            const data = await res.json();
            this.settings.documentText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          } catch(e) {
            alert('PDF読み込みに失敗しました。TXTなど別の形式をお試しください。');
          }
        };
        reader.readAsDataURL(file);
      } else {
        // TXT / MD / CSV → plain text
        const reader = new FileReader();
        reader.onload = (e) => { this.settings.documentText = e.target.result; };
        reader.readAsText(file, 'UTF-8');
      }
    },

    async generateFromDocument() {
      if (!this.settings.documentText || !this.apiKey) return;
      this.isGeneratingFromDoc = true;
      try {
        const endpoint = `${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`;
        const prompt = `以下の資料をもとに、口頭試問（口述試験）用の設定を生成してください。

【資料内容】
${this.settings.documentText.slice(0, 15000)}

必ず以下のJSON形式のみで回答してください（コードブロック不要）:
{
  "theme": "<試問テーマ（資料の主題を簡潔に）>",
  "questions": [
    { "question": "<問題文>", "expectedAnswer": "<想定する答え（要点）>", "notes": "", "difficulty": 2 },
    { "question": "<問題文>", "expectedAnswer": "<想定する答え（要点）>", "notes": "", "difficulty": 3 },
    { "question": "<問題文>", "expectedAnswer": "<想定する答え（要点）>", "notes": "", "difficulty": 3 },
    { "question": "<問題文>", "expectedAnswer": "<想定する答え（要点）>", "notes": "", "difficulty": 4 },
    { "question": "<問題文>", "expectedAnswer": "<想定する答え（要点）>", "notes": "", "difficulty": 4 }
  ],
  "criteria": [
    { "name": "<評価基準名>", "description": "<説明>" },
    { "name": "<評価基準名>", "description": "<説明>" },
    { "name": "<評価基準名>", "description": "<説明>" }
  ]
}`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4 }
          })
        });
        const data = await res.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        raw = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);

        if (parsed.theme) this.settings.theme = parsed.theme;
        if (parsed.questions) this.settings.questions = parsed.questions;
        if (parsed.criteria) this.settings.criteria = parsed.criteria;

        await this.saveSettings();
        alert('✅ 問題・評価基準を自動生成しました！内容を確認して保存してください。');
      } catch(e) {
        alert('生成に失敗しました: ' + (e.message || e));
      }
      this.isGeneratingFromDoc = false;
    },

    async saveSettings() {
      // Sync settings into the active test
      const t = this.tests.find(t => t.id === this.activeTestId);
      if (t) {
        t.settings = JSON.parse(JSON.stringify(this.settings));
        await _supabase.from('tests').upsert({
          id: t.id,
          name: t.name,
          class_id: t.classId || null,
          class_ids: t.classIds || [],
          settings: t.settings
        });
      }
      localStorage.setItem('gemini_model', this.selectedModel);
      this.saved = true;
      setTimeout(() => this.saved = false, 2000);
    },

    startExamPage() {
      this.messages = [];
      this.examStarted = false;
      this.result = null;
      this.inputText = '';
      // voiceMode keeps its current value; user selects on exam start screen
      this.page = 'exam';
      this.$nextTick(() => this.initQuill());
    },

    async switchVoiceMode(toVoice) {
      if (toVoice === this.voiceMode) return;
      if (toVoice) {
        // Text → Voice: preserve conversation context
        const lastAiMsg = [...this.messages].reverse().find(m => m.role === 'assistant');
        this._reconnectContext = lastAiMsg
          ? `音声モードに切り替えました。試験を継続してください。直前のあなたの質問は「${lastAiMsg.content.slice(0, 200).replace(/\n/g, ' ')}」です。その続きから試験を進めてください。`
          : null;
        this.voiceMode = true;
        await this.initLiveSession();
      } else {
        // Voice → Text: stop live session, show text input
        this.stopLiveSession();
        this.voiceMode = false;
        await this.$nextTick();
        this.initQuill();
      }
    },

    async startExam() {
      this.examStarted = true;
      this.setupFocusMonitoring();
      // Voice mode: connect to Gemini Live API instead of REST
      if (this.voiceMode) {
        await this.initLiveSession();
        return;
      }
      this.isLoading = true;
      const systemPrompt = this.buildSystemPrompt();
      const response = await this.callGemini(systemPrompt, []);
      if (response) {
        this.messages.push({ role: 'assistant', content: response });
        this.scrollToBottom();
      }
      this.isLoading = false;
    },

    initQuill() {
      // If quill already exists, just clear it
      if (window._quill) { window._quill.setContents([]); return; }
      const quill = new Quill('#quill-editor', {
        theme: 'snow',
        placeholder: '回答を入力... (⌘+Enter で送信)',
        modules: {
          toolbar: '#quill-toolbar',
          keyboard: {
            bindings: {
              submitCmd: {
                key: 13, metaKey: true,
                handler: () => { this.handleSend(); return false; }
              },
              submitCtrl: {
                key: 13, ctrlKey: true,
                handler: () => { this.handleSend(); return false; }
              },
              // Google Docs: Cmd+Alt+1/2/3 for headings
              heading1: { key: 49, metaKey: true, altKey: true, handler: () => { quill.format('header', 1); return false; } },
              heading2: { key: 50, metaKey: true, altKey: true, handler: () => { quill.format('header', 2); return false; } },
              heading3: { key: 51, metaKey: true, altKey: true, handler: () => { quill.format('header', 3); return false; } },
              // Google Docs: Cmd+Shift+7 ordered list
              orderedList: { key: 55, metaKey: true, shiftKey: true, handler: () => { const f = quill.getFormat(); quill.format('list', f.list === 'ordered' ? false : 'ordered'); return false; } },
              // Google Docs: Cmd+Shift+8 bullet list
              bulletList:  { key: 56, metaKey: true, shiftKey: true, handler: () => { const f = quill.getFormat(); quill.format('list', f.list === 'bullet' ? false : 'bullet'); return false; } },
              // Google Docs: Cmd+Shift+9 blockquote (actually Cmd+Alt+0 in GDocs but close)
              blockquote:  { key: 57, metaKey: true, shiftKey: true, handler: () => { const f = quill.getFormat(); quill.format('blockquote', !f.blockquote); return false; } },
            }
          }
        }
      });
      // Keep quill editor div flex to fill wrapper height
      quill.root.style.height = '100%';
      quill.root.style.overflowY = 'auto';
      window._quill = quill;
    },

    getQuillText() {
      if (!window._quill) return this.inputText;
      const text = window._quill.getText().trim();
      return text;
    },

    getQuillHtml() {
      if (!window._quill) return this.inputText;
      const html = window._quill.root.innerHTML;
      // Empty quill produces <p><br></p>
      if (html === '<p><br></p>') return '';
      return html;
    },

    clearQuill() {
      if (window._quill) {
        window._quill.setContents([]);
        window._quill.focus();
      }
      this.inputText = '';
    },

    async handleSend() {
      const html = this.getQuillHtml();
      const text = this.getQuillText();
      if (!text || this.isLoading) return;
      this.clearQuill();
      this.messages.push({ role: 'user', content: text, html: html });
      this.scrollToBottom();
      this.isLoading = true;
      const systemPrompt = this.buildSystemPrompt();
      const response = await this.callGemini(systemPrompt, this.messages);
      if (response) {
        this.messages.push({ role: 'assistant', content: response });
        this.scrollToBottom();
      }
      this.isLoading = false;
    },

    async endExam() {
      if (!this.examStarted || (this.messages.length < 2 && !this.voiceMode) || this.isScoring) return;
      // Show custom modal instead of confirm() to stay in fullscreen
      this.showEndConfirm = true;
    },

    async confirmEndExam() {
      this.showEndConfirm = false;
      this.teardownFocusMonitoring();
      if (this.voiceMode) this.stopLiveSession();
      this.isScoring = true;

      const activeCriteria = this.settings.criteria.filter(c => c.name);
      const criteriaCount = activeCriteria.length;
      const pointsEach = Math.floor(100 / criteriaCount);
      const remainder = 100 - pointsEach * criteriaCount;

      const conversationLog = this.messages.map(m =>
        `【${m.role === 'assistant' ? '試験官' : '受験者'}】${m.content}`
      ).join('\n\n');

      const criteriaList = activeCriteria.map((c, i) => {
        const pts = pointsEach + (i === 0 ? remainder : 0);
        return `${i + 1}. ${c.name}（${pts}点満点）${c.description ? ': ' + c.description : ''}`;
      }).join('\n');

      // Build expected-answer comparison block if any question has an expected answer
      const activeQuestions = (this.settings.questions || []).filter(q => q.question.trim());
      const questionsWithAnswer = activeQuestions.filter(q => q.expectedAnswer.trim());
      let expectedAnswerBlock = '';
      if (questionsWithAnswer.length > 0) {
        expectedAnswerBlock = `
【問題と想定する答えの対照】
${activeQuestions.map((q, i) =>
  `問${i + 1}: ${q.question}` +
  (q.expectedAnswer ? `\n　想定する答え: ${q.expectedAnswer}` : '\n　想定する答え: （未設定）') +
  (q.notes ? `\n　備考: ${q.notes}` : '')
).join('\n\n')}

【採点方法】
各問いについて以下2軸で評価し、最終スコアを総合的に判断してください：
① 想定する答えとの比較（想定する答えが設定されている問いのみ）: 想定する答えの要素・観点がどの程度カバーされているか
② AI独自の評価（全問い）: 回答の正確さ・論理性・理解の深さ（想定する答えと異なっていても正しい回答は正当に評価する）
※ ①と②を総合的に判断し、最終スコアを決定してください。`;
      }

      const prompt = `あなたは優秀な教育評価者です。以下の口頭試問の記録を詳細に分析し、採点してください。

試問テーマ: ${this.settings.theme}
${expectedAnswerBlock}

評価基準（合計100点満点）:
${criteriaList}

以下の口頭試問の記録を評価してください:

${conversationLog}

必ず以下のJSON形式のみで回答してください（コードブロック不要）:
{
  "totalScore": <合計点数(0-100)>,
  "criteria": [
    {
      "name": "<評価基準名>",
      "score": <点数>,
      "maxScore": <満点>,
      "comment": "<詳細な評価コメント（200文字程度）>"
    }
  ],${activeQuestions.length > 0 ? `
  "questionScores": [
    {
      "questionNum": <問番号(1始まり)>,
      "question": "<問題文（短縮可）>",
      "score": <点数(0-10)>,
      "maxScore": 10,
      "comment": "<この問に対する評価コメント（150文字程度）>"
    }
  ],` : ''}
  "overallComment": "<総合評価コメント（300文字程度）>",
  "improvements": ["<改善点1>", "<改善点2>", "<改善点3>"]
}`;

      try {
        const endpoint = `${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 }
          })
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || 'API Error ' + res.status);
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          this.result = JSON.parse(jsonMatch[0]);
          this.saveResult();
          this.page = 'result';
        } else {
          alert('採点結果の解析に失敗しました。');
        }
      } catch (err) {
        console.error(err);
        const msg = err.message || '';
        if (msg.includes('quota') || msg.includes('429') || msg.includes('limit: 0')) {
          alert('⚠️ APIクォータ超過\n\nホーム画面でモデルを「gemini-1.5-flash」または「gemini-1.5-flash-8b」に変更してお試しください。\n\nエラー: ' + msg);
        } else {
          alert('採点に失敗しました: ' + msg);
        }
      } finally {
        this.isScoring = false;
      }
    },

    retryExam() {
      this.teardownFocusMonitoring();
      if (this.voiceMode) this.stopLiveSession();
      this.voiceMode = false;
      this.focusViolationCount = 0;
      this.focusViolations = [];
      this.focusViolationFlagged = false;
      this.showViolationWarning = false;
      this.messages = [];
      this.examStarted = false;
      this.result = null;
      this.inputText = '';
      if (window._quill) window._quill.setContents([]);
      this.page = 'exam';
    },

    buildSystemPrompt() {
      // フリートークモード用プロンプト
      if (this.freeTalkMode) {
        const topic = this.freeTalkTopic.trim();
        return `あなたは親切で知的な学習サポートAIです。
${topic ? `今日の話題: 「${topic}」` : '特定のテーマを決めず、受験者が話したいことについて自由に対話します。'}

あなたの役割:
1. ${topic ? `「${topic}」に関連した質問から会話を始める` : '受験者が話したいテーマを引き出す質問から始める'}
2. 受験者の発言を深掘りし、理解を促す質問をする
3. 必要に応じて補足説明・別の視点・具体例を提供する
4. 会話を通じて受験者の考えや理解を深める
5. 温かみのある、対話的な口調で話す
6. 一度に一つのことだけ聞く

【絶対厳守】発話ルール:
- 思考過程・計画・意図の説明を一切しゃべらないこと
- 英語での発言・注釈・コメントは一切しないこと
- 日本語の質問・回答のみを、そのまま発話すること
- "I'm now ready to...", "Let me start..." のような文は絶対に発話しないこと

${topic ? `「${topic}」について話し合いましょう。` : '何でも話しましょう。'}まず最初の質問から始めてください。`;
      }

      const activeCriteria = this.settings.criteria.filter(c => c.name);
      const criteriaText = activeCriteria.map((c, i) =>
        `${i + 1}. ${c.name}${c.description ? '（' + c.description + '）' : ''}`
      ).join('\n');

      const activeQuestions = (this.settings.questions || []).filter(q => q.question.trim());
      const hasQuestions = activeQuestions.length > 0;

      let questionBlock = '';
      const difficultyLabels = ['易（基礎的な定義・事実の確認）', 'やや易（概念の理解と説明）', '標準（応用・比較・分析）', 'やや難（複合的な問題解決）', '難（高度な応用・批判的思考）'];
      if (hasQuestions) {
        const qList = activeQuestions.map((q, i) => {
          let line = `【問${i + 1}】${q.question}`;
          if (q.difficulty) line += `\n　（内部ガイド）難易度: Lv.${q.difficulty}（${difficultyLabels[q.difficulty - 1]}）— 受験者には伝えないこと`;
          if (q.notes) line += `\n　（内部ガイド）備考: ${q.notes}`;
          return line;
        }).join('\n\n');
        questionBlock = `
以下の問題リストを順番に出題してください:
${qList}

各問いの進め方:
- 問いを提示する際、難易度レベルや内部ガイドの情報は受験者に一切伝えないこと
- 問いを提示し、受験者の回答を受け取る
- 回答が不十分な場合は1〜2回の深掘り質問をしてから次の問いへ進む（難易度が高い問いほど深掘りを丁寧に）
- 全ての問いが終わったら「以上で試問を終了します」と伝える`;
      } else {
        const diffDist = this.settings.difficultyDistribution || [0,0,0,0,0];
        const diffSum = diffDist.reduce((a, b) => a + b, 0);
        const totalQ = diffSum > 0 ? diffSum : (this.settings.autoQuestionCount || 5);
        if (diffSum > 0) {
          const distLines = diffDist
            .map((count, i) => count > 0 ? `  - Lv.${i+1}（${difficultyLabels[i]}）: ${count}問` : null)
            .filter(Boolean).join('\n');
          questionBlock = `
テーマに基づいて、以下の難易度内訳で合計${totalQ}問を順番に出題してください:
${distLines}

出題順序: 易しい問いから難しい問いへ段階的に進んでください。
各問いの進め方:
- 問いを提示し、受験者の回答を受け取る
- 回答が不十分な場合は1〜2回の深掘り質問をしてから次の問いへ進む（難易度が高いほど丁寧に深掘り）
- 全ての問いが終わったら「以上で試問を終了します」と伝える`;
        } else {
          questionBlock = `\nテーマに基づいて、${totalQ}問を順番に出題してください。易しい問いから難しい問いへ段階的に進むよう工夫してください。`;
        }
      }

      const isLearning = this.settings.learningMode;

      const roleLines = isLearning ? `
1. ${hasQuestions ? '指定された問題リストを順番に出題する' : 'テーマに基づいて適切な質問を行う'}
2. 受験者の回答に対して深掘り質問をする
3. 【学習モード】受験者が「ヒントをください」「ヒント」と求めた場合は、答えに直結しない範囲でヒントを提供する
4. 【学習モード】受験者が「答えを教えて」「正解を教えて」「解説して」などと求めた場合は、正解と丁寧な解説を提供する
5. 回答が不十分な場合は「もう少し詳しく説明してください」などと促す（または希望すればヒントを提示する旨を伝える）
6. 一度に一つの質問のみ行う
7. 学習をサポートする温かみのある口調で振る舞う
8. 【重要】内部思考・計画メモ・英語の注釈（例: **Initiating Exam** などの太字見出し）は絶対に出力しない。自然な日本語のみで発言すること` : `
1. ${hasQuestions ? '指定された問題リストを順番に出題する' : 'テーマに基づいて適切な質問を行う'}
2. 受験者の回答に対して深掘り質問をする
3. 【絶対禁止】試験中は正解・解説・ヒントを一切教えない
4. 回答が不十分な場合は「もう少し詳しく説明してください」などと促す
5. 回答が的外れな場合も正解を教えず「別の観点から考えてみてください」などと促す
6. 一度に一つの質問のみ行う
7. 簡潔に、試験官らしく振る舞う
8. 【重要】内部思考・計画メモ・英語の注釈（例: **Initiating Exam** や **Refusing Aid Request** などの太字見出し）は絶対に出力しない。試験官として自然な日本語のみで発言すること`;

      const noMetaRule = `
【絶対厳守】発話ルール:
- 思考過程・計画・意図の説明を一切しゃべらないこと
- 英語での発言・注釈・コメントは一切しないこと
- 質問を提示する際、絶対に「Lv」「レベル」「難易度」「易しい」「難しい」のような言葉を含めて発言しないこと
- "I'm now ready to...", "The first query is...", "I've formulated..." のような文は絶対に発話しないこと
- 日本語の質問・回答のみを、そのまま自然な会話として発話すること
- 悪い例（禁止）: "Lv.1の難易度から出題します。地政学とは何か、定義を説明してください。"
- 良い例（正しい）: 「地政学とは何か、定義を説明してください。」`;

      const documentBlock = this.settings.documentText
        ? `\n【参考資料】（この内容に基づいて試問を行うこと。受験者には資料を見せず、口頭で問うこと）:\n${this.settings.documentText.slice(0, 12000)}\n`
        : '';

      return `あなたは${isLearning ? '学習をサポートする教育者' : '厳格で公平な口頭試問の試験官'}です。
試問テーマ: ${this.settings.theme}
${isLearning ? 'モード: 【学習モード】ヒントや解説の提供が許可されています。' : ''}
あなたの役割:${roleLines}
${noMetaRule}
${documentBlock}
${questionBlock}

評価観点（試験中は言及しない）:
${criteriaText}

最初の質問から始めてください。`;
    },

    async callGemini(systemPrompt, messages) {
      try {
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        if (contents.length === 0) {
          contents.push({ role: 'user', parts: [{ text: '試験を開始してください。最初の質問をしてください。' }] });
        }

        const endpoint = `${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
          })
        });

        if (!res.ok) {
          const err = await res.json();
          const errMsg = err.error?.message || 'API Error ' + res.status;
          if (errMsg.includes('quota') || errMsg.includes('limit: 0') || res.status === 429) {
            throw new Error('QUOTA_EXCEEDED: ' + errMsg);
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      } catch (err) {
        console.error('Gemini error:', err);
        if (err.message && err.message.startsWith('QUOTA_EXCEEDED')) {
          alert('⚠️ APIクォータ超過\n\nホーム画面でモデルを「gemini-1.5-flash」または「gemini-1.5-flash-8b」に変更してお試しください。');
        } else {
          alert('APIエラー: ' + (err.message || err));
        }
        return null;
      }
    },

    // ========== FOCUS MONITORING / ANTI-CHEAT ==========

    setupFocusMonitoring() {
      if (!this.focusMonitoringEnabled) return;
      // Reset counts
      this.focusViolationCount = 0;
      this.focusViolations = [];
      this.focusViolationFlagged = false;
      this.showViolationWarning = false;
      const self = this;

      const onVisibilityChange = () => {
        if (document.hidden && self.examStarted && self.page === 'exam' && !self.showEndConfirm) {
          self.recordFocusViolation('tab_switch');
        }
      };
      const onBlur = () => {
        if (self.examStarted && self.page === 'exam' && !self.showEndConfirm) {
          self.recordFocusViolation('window_blur');
        }
      };
      const onFullscreenChange = () => {
        if (!document.fullscreenElement && self.examStarted && self.page === 'exam' && !self.showEndConfirm) {
          self.recordFocusViolation('fullscreen_exit');
          // Attempt to re-enter fullscreen after a short delay
          setTimeout(() => {
            if (self.examStarted && self.page === 'exam') {
              document.documentElement.requestFullscreen().catch(() => {});
            }
          }, 800);
        }
      };

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('blur', onBlur);
      document.addEventListener('fullscreenchange', onFullscreenChange);
      this._focusHandlers = { onVisibilityChange, onBlur, onFullscreenChange };

      // Enter fullscreen
      document.documentElement.requestFullscreen().catch(() => {});
    },

    teardownFocusMonitoring() {
      if (this._focusHandlers) {
        document.removeEventListener('visibilitychange', this._focusHandlers.onVisibilityChange);
        window.removeEventListener('blur', this._focusHandlers.onBlur);
        document.removeEventListener('fullscreenchange', this._focusHandlers.onFullscreenChange);
        this._focusHandlers = null;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    },

    recordFocusViolation(type) {
      const activeQuestions = (this.settings.questions || []).filter(q => q.question && q.question.trim());
      const threshold = activeQuestions.length > 0 ? Math.min(activeQuestions.length * 3, 12) : 12;

      this.focusViolationCount++;
      this.focusViolations.push({ type, time: new Date().toISOString(), count: this.focusViolationCount });
      // Show warning overlay for 3 seconds
      this.showViolationWarning = true;
      clearTimeout(this._violationWarningTimer);
      this._violationWarningTimer = setTimeout(() => { this.showViolationWarning = false; }, 3000);
      // Flag if threshold reached
      if (this.focusViolationCount >= threshold) {
        this.focusViolationFlagged = true;
      }
    },

    // ========== END FOCUS MONITORING ==========

    scrollToBottom() {
      this.$nextTick(() => {
        const el = document.getElementById('messages-end');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    }
  },

    _playNextAudioChunk() {
      if (this.voiceAudioQueue.length === 0) {
        this.voiceIsPlaying = false;
        if (this.liveStatus === 'ai_speaking') this.liveStatus = 'listening';
        return;
      }
      this.voiceIsPlaying = true;
      this.liveStatus = 'ai_speaking';

      if (!this.voicePlayCtx || this.voicePlayCtx.state === 'closed') {
        this.voicePlayCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        this.voiceScheduledTime = this.voicePlayCtx.currentTime;
      }
      // Resume suspended context (browsers suspend AudioContext until user interaction)
      if (this.voicePlayCtx.state === 'suspended') {
        this.voicePlayCtx.resume().catch(() => {});
      }

      // Drain all queued chunks and schedule them back-to-back
      while (this.voiceAudioQueue.length > 0) {
        const b64 = this.voiceAudioQueue.shift();
        const buf = this._base64ToBuf(b64);
        const i16 = new Int16Array(buf);
        const f32 = new Float32Array(i16.length);
        for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768.0;

        // OLA time-stretch: change speed WITHOUT changing pitch
        const resampled = this._timeStretch(f32, this.voicePlaybackRate);
        const ab = this.voicePlayCtx.createBuffer(1, resampled.length, 24000);
        ab.getChannelData(0).set(resampled);
        const src = this.voicePlayCtx.createBufferSource();
        src.buffer = ab;
        // playbackRate stays 1.0 — pitch is preserved by resampling
        src.connect(this.voicePlayCtx.destination);
        const startAt = Math.max(this.voiceScheduledTime, this.voicePlayCtx.currentTime);
        src.start(startAt);
        this.voiceScheduledTime = startAt + ab.duration;
      }

      // Poll for more chunks while playing, then transition back to listening
      const checkDone = () => {
        if (!this.voicePlayCtx) return;
        if (this.voiceAudioQueue.length > 0) {
          this._playNextAudioChunk(); return;
        }
        const remaining = (this.voiceScheduledTime - this.voicePlayCtx.currentTime) * 1000;
        if (remaining > 50) {
          setTimeout(checkDone, Math.min(remaining, 200));
        } else {
          this.voiceIsPlaying = false;
          if (this.liveStatus === 'ai_speaking') this.liveStatus = 'listening';
        }
      };
      setTimeout(checkDone, 100);
    },

    _timeStretch(f32, speed) {
      if (Math.abs(speed - 1.0) < 0.01) return f32;
      const FRAME = 1024;   // window size (samples)
      const HOP   = 512;    // output hop = FRAME/2 (50% overlap)
      const outputLen = Math.max(FRAME, Math.round(f32.length / speed));
      const out  = new Float32Array(outputLen);
      const norm = new Float32Array(outputLen);
      // Pre-compute Hann window
      const hann = new Float32Array(FRAME);
      for (let i = 0; i < FRAME; i++) {
        hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FRAME - 1)));
      }
      // Overlap-add: for each output frame position, read from scaled input position
      for (let outPos = 0; outPos + FRAME <= outputLen; outPos += HOP) {
        const inPos = Math.round(outPos * speed);
        if (inPos + FRAME > f32.length) break;
        for (let i = 0; i < FRAME; i++) {
          const w = hann[i];
          out[outPos + i]  += f32[inPos + i] * w;
          norm[outPos + i] += w * w;  // power normalization
        }
      }
      // Normalize accumulated frames
      for (let i = 0; i < outputLen; i++) {
        if (norm[i] > 1e-6) out[i] /= norm[i];
      }
      return out;
    },

    async reconnectLiveSession() {
      const isActive = ['listening','ready','ai_speaking'].includes(this.liveStatus);
      // Save last AI message so we can resume naturally after reconnect
      const lastAiMsg = [...this.messages].reverse().find(m => m.role === 'assistant');
      this._reconnectContext = lastAiMsg
        ? `音声設定変更のため再接続しました。試験を継続してください。あなたの直前の発言は「${lastAiMsg.content.slice(0, 200).replace(/\n/g, ' ')}」です。その続きから試験を再開してください。`
        : null;
      this.stopLiveSession();
      await new Promise(r => setTimeout(r, 400));
      await this.initLiveSession();
    },

    parseMarkdown(text) {
      if (!text) return '';
      if (typeof marked === 'undefined') return text;
      return marked.parse(text);
    },

    _hasJapanese(s) {
      return /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(s);
    },

    _cleanAiText(text) {
      if (!text) return text;
      // Remove **bold** markers first
      let t = text.replace(/\*\*([^*]+)\*\*/g, '$1');
      // Split on sentence-ending punctuation (English . ! ? or Japanese 。！？)
      // followed by a space+capital or newline
      const segments = t.split(/(?<=[.!?。！？])\s+(?=[A-Z\u3000-\u9FFF\uF900-\uFAFF])/);
      const hasAnyEnglishOnly = segments.some(s => s.trim().length > 15 && !this._hasJapanese(s));
      // Only filter if there are clearly English-only segments to remove
      if (hasAnyEnglishOnly) {
        const jpSegments = segments.filter(s => this._hasJapanese(s));
        if (jpSegments.length > 0) return jpSegments.join(' ').trim();
      }
      return t.trim();
    },

    stopLiveSession() {
      if (this.voiceAudioCtx) { try { this.voiceAudioCtx.close(); } catch(e){} this.voiceAudioCtx = null; }
      if (this.voicePlayCtx)  { try { this.voicePlayCtx.close();  } catch(e){} this.voicePlayCtx = null; }
      if (this.voiceMicStream) { this.voiceMicStream.getTracks().forEach(t => t.stop()); this.voiceMicStream = null; }
      if (this.liveWs) { try { this.liveWs.close(); } catch(e){} this.liveWs = null; }
      this.liveStatus = 'idle';
      this.liveErrorMsg = '';
      this.voiceAudioQueue = [];
      this.voiceIsPlaying = false;
      this.voiceCurrentAiText = '';
      this._pendingUserText = '';
      this.voiceMuted = false;
      this.showVoiceSettings = false;
    }
  };
};
