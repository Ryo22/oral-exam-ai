window.appExam = function() {
  return {
    async startMypageChat() {
      const r = this.mypageSelectedResult;
      if (!r || !this.apiKey) return;
      this.mypageShowChat = true;
      this.mypageChatMessages = [];
      this.mypageChatLoading = true;

      const score = r.adminScore || r;
      const criteriaText = (score.criteria || [])
        .map(c => `・${c.name}: ${c.score}/${c.maxScore}点 — ${c.comment || '（コメントなし）'}`)
        .join('\n');
      const improvementsText = (r.improvements || []).length
        ? (r.improvements || []).map((v, i) => `${i+1}. ${v}`).join('\n')
        : 'なし';
      const logText = (r.conversationLog || [])
        .map(m => `【${m.role === 'user' ? '受験者' : 'AI試験官'}】${m.content}`)
        .join('\n');

      this._mypageChatSystemContext = `あなたは親切で丁寧な学習サポートAIです。
以下は受験者が受けた口頭試問の記録と採点結果です。この内容を踏まえ、受験者が理解を深め、さらに学びを伸ばせるよう対話をサポートしてください。

【試験テーマ】
${r.theme}

【採点結果】
合計: ${score.totalScore || r.totalScore}点 / 100点

【評価項目別スコアとフィードバック】
${criteriaText}

【総合コメント】
${score.overallComment || r.overallComment || 'なし'}

【改善すべき点】
${improvementsText}

【試問の会話ログ】
${logText}

---
受験者の質問や「〜をもっと詳しく教えて」という要望に対して、具体的でわかりやすい説明をしてください。
苦手な分野については補足説明や練習問題を提示してもよいです。
受験者が自信を持てるよう、ポジティブかつ建設的な口調で話しかけてください。`;

      try {
        const res = await fetch(`${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: this._mypageChatSystemContext }] },
            contents: [{ role: 'user', parts: [{ text: '試験結果を見ました。どこを重点的に復習すればよいか教えてください。' }] }]
          })
        });
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'エラーが発生しました。';
        this.mypageChatMessages = [
          { role: 'user', content: '試験結果を見ました。どこを重点的に復習すればよいか教えてください。' },
          { role: 'assistant', content: reply }
        ];
      } catch(e) {
        this.mypageChatMessages = [{ role: 'assistant', content: 'エラーが発生しました。APIキーを確認してください。' }];
      }
      this.mypageChatLoading = false;
      this.$nextTick(() => {
        const el = this.$refs.mypageChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },

    async sendMypageChatMessage() {
      const text = this.mypageChatInput.trim();
      if (!text || this.mypageChatLoading) return;
      this.mypageChatInput = '';
      this.mypageChatMessages.push({ role: 'user', content: text });
      this.mypageChatLoading = true;
      this.$nextTick(() => {
        const el = this.$refs.mypageChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });

      try {
        const contents = this.mypageChatMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));
        const res = await fetch(`${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: this._mypageChatSystemContext }] },
            contents
          })
        });
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'エラーが発生しました。';
        this.mypageChatMessages.push({ role: 'assistant', content: reply });
      } catch(e) {
        this.mypageChatMessages.push({ role: 'assistant', content: 'エラーが発生しました。' });
      }
      this.mypageChatLoading = false;
      this.$nextTick(() => {
        const el = this.$refs.mypageChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
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

    scrollToBottom() {
      this.$nextTick(() => {
        const el = document.getElementById('messages-end');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
};
