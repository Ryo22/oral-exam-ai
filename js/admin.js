window.appAdmin = function() {
  return {
    get filteredResults() {
      return [...this.examResults]
        .filter(r => this.adminFilterClassId === 'all' || r.classId === this.adminFilterClassId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    get availableTestsForStudent() {
      return this.tests.filter(t => !t.classIds || t.classIds.length === 0 || (this.studentClassId && t.classIds.includes(this.studentClassId)));
    },

    selectTestForStudent(id) {
      this.activeTestId = id;
      const t = this.tests.find(x => x.id === id);
      if (t) {
        this.settings = JSON.parse(JSON.stringify(t.settings));
        if (!this.settings.questions) this.settings.questions = [];
        if (!this.settings.criteria) this.settings.criteria = [];
      }
    },

    saveApiKey() {
      localStorage.setItem('gemini_api_key', this.apiKey);
      if (typeof _supabase !== 'undefined' && _supabase) {
        _supabase.from('app_settings').upsert({ key: 'gemini_api_key', value: this.apiKey }).then();
      }
    },

    adminLogin() {
      if (this.adminLoginInput === this.adminPassword) {
        this.isAdmin = true;
        this.adminLoginError = false;
        this.adminLoginInput = '';
        this.page = 'admin';
      } else {
        this.adminLoginError = true;
      }
    },

    changeAdminPassword() {
      if (!this.adminNewPassword.trim()) return;
      this.adminPassword = this.adminNewPassword.trim();
      this.saveAppSetting('admin_password', this.adminPassword);
      this.adminNewPassword = '';
      alert('パスワードを変更しました');
    },

    addClass() {
      const id = 'class_' + Date.now();
      const name = 'クラス' + (this.classes.length + 1);
      this.classes.push({ id, name });
      this.saveClassesToStorage();
      this.$nextTick(() => { this.editingClassId = id; this.editingClassName = name; });
    },

    saveClassesToStorage() {
        _supabase.from('classes').upsert(this.classes.map(c => ({ id: c.id, name: c.name })));
    },

    startEditClass(id, name) {
      this.editingClassId = id;
      this.editingClassName = name;
    },

    saveClassName(id) {
      const c = this.classes.find(c => c.id === id);
      if (c && this.editingClassName.trim()) c.name = this.editingClassName.trim();
      this.editingClassId = null;
      this.editingClassName = '';
      this.saveClassesToStorage();
    },

    cancelEditClass() {
      this.editingClassId = null;
      this.editingClassName = '';
    },

    removeClass(id) {
      const hasResults = this.examResults.some(r => r.classId === id);
      if (hasResults && !confirm('このクラスには採点結果があります。本当に削除しますか？')) return;
      this.classes = this.classes.filter(c => c.id !== id);
      this.saveClassesToStorage();
    },

    getClassUrl(classId) {
      const base = window.location.href.split('?')[0];
      return base + '?class=' + classId;
    },

    copyClassUrl(classId) {
      const url = this.getClassUrl(classId);
      navigator.clipboard.writeText(url).then(() => alert('URLをコピーしました:\n' + url)).catch(() => prompt('このURLをコピーしてください:', url));
    },

    getTestUrl(testId) {
      const base = window.location.origin + window.location.pathname;
      return base + '?test=' + testId;
    },

    copyTestUrl(testId) {
      const url = this.getTestUrl(testId);
      navigator.clipboard.writeText(url).then(() => alert('テストURLをコピーしました:\n' + url)).catch(() => prompt('このURLをコピーしてください:', url));
    },

    copyTestClassUrl(testId, classId) {
      const base = window.location.origin + window.location.pathname;
      const url = base + '?test=' + testId + '&class=' + classId;
      navigator.clipboard.writeText(url).then(() => alert('URLをコピーしました:\n' + url)).catch(() => prompt('このURLをコピーしてください:', url));
    },

    toggleTestClass(testId, classId, checked) {
      const t = this.tests.find(t => t.id === testId);
      if (!t) return;
      if (!t.classIds) t.classIds = [];
      if (checked) {
        if (!t.classIds.includes(classId)) t.classIds.push(classId);
      } else {
        t.classIds = t.classIds.filter(id => id !== classId);
      }
      _supabase.from('tests').update({ class_ids: t.classIds }).eq('id', testId);
    },

    async saveTestsToStorage() {
      const rows = this.tests.map(t => ({
        id: t.id,
        name: t.name,
        class_id: t.classId || null,
        class_ids: t.classIds || [],
        status: t.status || 'draft',
        settings: t.settings || {}
      }));
      const { error } = await _supabase.from('tests').upsert(rows);
      if (error) { console.error('Failed to save tests:', error); alert('テストの保存に失敗しました\n' + error.message); return; }
      // Delete tests that no longer exist
      if (this.tests.length > 0) {
        const ids = this.tests.map(t => t.id);
        const { error: delError } = await _supabase.from('tests').delete().not('id', 'in', ids);
        if (delError) console.error('Failed to prune old tests:', delError);
      } else {
        // テストが0件になった場合はDB上の全テストを削除
        await _supabase.from('tests').delete().neq('id', '');
      }
    },

    switchTest(id, skipSave = false) {
      if (id === this.activeTestId) return;
      // Save current settings into the current test
      const cur = this.tests.find(t => t.id === this.activeTestId);
      if (cur) cur.settings = JSON.parse(JSON.stringify(this.settings));
      // Load new test
      this.activeTestId = id;
      const next = this.tests.find(t => t.id === id);
      if (next) {
        this.settings = JSON.parse(JSON.stringify(next.settings));
        if (!this.settings.questions) this.settings.questions = [];
        if (!this.settings.autoQuestionCount) this.settings.autoQuestionCount = 5;
        if (!this.settings.difficultyDistribution) this.settings.difficultyDistribution = [0,0,0,0,0];
        if (this.settings.criteria.length > 0 && typeof this.settings.criteria[0] === 'string') {
          this.settings.criteria = this.settings.criteria.map(c => ({ name: c, description: '' }));
        }
      }
      if (!skipSave) this.saveTestsToStorage();
    },

    addTest() {
      const id = 'test_' + Date.now();
      const name = 'テスト' + (this.tests.length + 1);
      const defaultSettings = {
        theme: '',
        criteria: [
          { name: '理解度', description: '概念を正確に理解し自分の言葉で説明できるか' },
          { name: '論理構成', description: '論理的に整理された回答ができているか' },
          { name: '表現力', description: '適切な用語を使い明確に伝えられているか' }
        ],
        questions: [],
        autoQuestionCount: 5,
        difficultyDistribution: [0,0,0,0,0],
        learningMode: false
      };
      this.tests.push({ id, name, classIds: [], status: 'draft', settings: defaultSettings });
      this.switchTest(id);
      this.$nextTick(() => { this.editingTestId = id; this.editingTestName = name; });
    },

    async deleteTestAndBack(id) {
      const existed = this.tests.some(t => t.id === id);
      await this.deleteTest(id);
      // 削除成功した場合（テストが消えていれば）管理画面に戻る
      if (existed && !this.tests.some(t => t.id === id)) this.page = 'admin';
    },

    async deleteTest(id) {
      const hasResults = this.examResults.some(r => r.testId === id);
      if (hasResults && !confirm('このテストには採点結果があります。本当に削除しますか？')) return;
      if (!hasResults && !confirm('このテストを削除しますか？')) return;
      this.tests = this.tests.filter(t => t.id !== id);
      if (this.activeTestId === id) {
        if (this.tests.length > 0) this.switchTest(this.tests[0].id, true);
        else {
          this.activeTestId = null;
          this.settings = {
            theme: '',
            criteria: [
              { name: '理解度', description: '概念を正確に理解し自分の言葉で説明できるか' },
              { name: '論理構成', description: '論理的に整理された回答ができているか' },
              { name: '表現力', description: '適切な用語を使い明確に伝えられているか' }
            ],
            questions: [],
            autoQuestionCount: 5,
            difficultyDistribution: [0,0,0,0,0],
            learningMode: false
          };
        }
      }
      // IDで直接削除（await して確実に完了させる）
      const { error } = await _supabase.from('tests').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete test:', error);
        alert('テストの削除に失敗しました。\n' + error.message + '\n\nSupabaseのRLSポリシーを確認してください。');
        return;
      }
      // 残りのテストを保存（"not in" での追加クリーンアップ）
      await this.saveTestsToStorage();
    },

    startEditTest(id, name) {
      this.editingTestId = id;
      this.editingTestName = name;
    },

    saveTestName(id) {
      const t = this.tests.find(t => t.id === id);
      if (t && this.editingTestName.trim()) t.name = this.editingTestName.trim();
      this.editingTestId = null;
      this.editingTestName = '';
      this.saveTestsToStorage();
    },

    cancelEditTest() {
      this.editingTestId = null;
      this.editingTestName = '';
    },

    togglePublish(id) {
      const r = this.examResults.find(r => r.id === id);
      if (!r) return;
      r.published = !r.published;
      this.saveResults();
    },

    startEditResult(id) {
      const r = this.examResults.find(r => r.id === id);
      if (!r) return;
      this.editingResultId = id;
      // Deep clone, pre-fill from adminScore if exists, otherwise from AI
      const src = r.adminScore || { totalScore: r.totalScore, criteria: r.criteria, questionScores: r.questionScores || [], overallComment: r.overallComment };
      this.editingData = JSON.parse(JSON.stringify(src));
    },

    saveEditResult() {
      const r = this.examResults.find(r => r.id === this.editingResultId);
      if (!r) return;
      r.adminScore = JSON.parse(JSON.stringify(this.editingData));
      this.saveResults();
      this.editingResultId = null;
      this.editingData = null;
    },

    cancelEditResult() {
      this.editingResultId = null;
      this.editingData = null;
    },

    resetToAiScore(id) {
      if (!confirm('管理者の修正をリセットし、AIの採点に戻しますか？')) return;
      const r = this.examResults.find(r => r.id === id);
      if (r) { r.adminScore = null; this.saveResults(); }
    },

    getDisplayScore(r) {
      return r.adminScore ? r.adminScore.totalScore : r.totalScore;
    },

    findPastResults() {
      const name = (this.checkResultsName || this.studentName || '').trim();
      if (!name) { alert('お名前を入力してください'); return; }
      this.studentPastResults = this.examResults.filter(r =>
        r.published && (r.studentName === name || (this.studentEmail && r.studentEmail === this.studentEmail))
      ).sort((a, b) => new Date(b.date) - new Date(a.date));
      this.showPastResults = true;
    },

    async saveResults() {
      // Upsert all results to Supabase
      const rows = this.examResults.map(r => ({
        id: String(r.id),
        test_id: r.testId || null,
        class_id: r.classId || null,
        student_name: r.studentName || '',
        student_email: r.studentEmail || '',
        theme: r.theme || '',
        date: r.date || new Date().toISOString(),
        published: r.published || false,
        total_score: r.totalScore || 0,
        criteria: r.criteria || [],
        question_scores: r.questionScores || [],
        overall_comment: r.overallComment || '',
        improvements: r.improvements || [],
        ai_score: r.aiScore || null,
        admin_score: r.adminScore || null,
        focus_violation_count: r.focusViolationCount || 0,
        focus_violation_flagged: r.focusViolationFlagged || false,
        focus_violations: r.focusViolations || [],
        conversation_log: r.conversationLog || []
      }));
      if (rows.length > 0) {
        await _supabase.from('exam_results').upsert(rows);
      }
    },

    async loadFromSupabase() {
      // Load app settings
      const { data: settingsData } = await _supabase.from('app_settings').select('*');
      if (settingsData) {
        settingsData.forEach(({ key, value }) => {
          if (key === 'admin_password') this.adminPassword = value;
          if (key === 'google_client_id') this.googleClientId = value;
          if (key === 'show_score_to_student') this.showScoreToStudent = value === 'true';
          if (key === 'show_comment_to_student') this.showCommentToStudent = value === 'true';
          if (key === 'allow_student_history') this.allowStudentHistory = value === 'true';
          if (key === 'focus_monitoring_enabled') this.focusMonitoringEnabled = value === 'true';
          if (key === 'gemini_api_key' && value) this.apiKey = value;
        });
      }

      // Load classes
      const { data: classesData } = await _supabase.from('classes').select('*').order('created_at');
      if (classesData && classesData.length > 0) {
        this.classes = classesData.map(c => ({ id: c.id, name: c.name }));
      } else {
        this.classes = [{ id: 'default', name: 'クラス1' }];
        await _supabase.from('classes').upsert([{ id: 'default', name: 'クラス1' }]);
      }

      // Load tests
      const { data: testsData } = await _supabase.from('tests').select('*').order('created_at');
      if (testsData && testsData.length > 0) {
        this.tests = testsData.map(t => ({
          id: t.id,
          name: t.name,
          classId: t.class_id,
          classIds: Array.isArray(t.class_ids) ? t.class_ids : (t.class_ids ? JSON.parse(t.class_ids) : []),
          status: t.status || (t.published ? 'published' : 'draft'),
          settings: t.settings || {}
        }));
      } else {
        // Migrate from localStorage if exists
        const storedTests = localStorage.getItem('exam_tests_v1');
        if (storedTests) {
          try { this.tests = JSON.parse(storedTests); } catch(e) {}
        }
        if (this.tests.length === 0) {
          this.tests = [{ id: 'test_default', name: 'テスト1', classIds: [], settings: JSON.parse(JSON.stringify(this.settings)) }];
        }
        // Save migrated tests to Supabase
        const rows = this.tests.map(t => ({
          id: t.id, name: t.name, class_id: t.classId || null, class_ids: t.classIds || [], settings: t.settings || {}
        }));
        await _supabase.from('tests').upsert(rows);
        localStorage.removeItem('exam_tests_v1');
      }

      this.activeTestId = this.tests[0].id;
      this.settings = JSON.parse(JSON.stringify(this.tests[0].settings || this.settings));
      // Backward compat
      if (!this.settings.questions) this.settings.questions = [];
      if (!this.settings.autoQuestionCount) this.settings.autoQuestionCount = 5;
      if (!this.settings.difficultyDistribution) this.settings.difficultyDistribution = [0, 0, 0, 0, 0];
      if (!this.settings.criteria) this.settings.criteria = [];
      if (!this.settings.documentText) this.settings.documentText = '';
      if (!this.settings.documentName) this.settings.documentName = '';
      if (this.settings.criteria.length > 0 && typeof this.settings.criteria[0] === 'string') {
        this.settings.criteria = this.settings.criteria.map(c => ({ name: c, description: '' }));
      }

      // Load exam results
      const { data: resultsData } = await _supabase.from('exam_results').select('*').order('date', { ascending: false });
      if (resultsData) {
        this.examResults = resultsData.map(r => ({
          id: r.id,
          date: r.date,
          theme: r.theme,
          studentName: r.student_name,
          studentEmail: r.student_email,
          classId: r.class_id,
          testId: r.test_id,
          published: r.published,
          totalScore: r.total_score,
          criteria: r.criteria,
          questionScores: r.question_scores,
          overallComment: r.overall_comment,
          improvements: r.improvements,
          aiScore: r.ai_score,
          adminScore: r.admin_score,
          focusViolationCount: r.focus_violation_count,
          focusViolationFlagged: r.focus_violation_flagged,
          focusViolations: r.focus_violations,
          conversationLog: r.conversation_log,
        }));
      } else {
        // Migrate from localStorage if exists
        const storedResults = localStorage.getItem('exam_results');
        if (storedResults) {
          try {
            this.examResults = JSON.parse(storedResults);
            await this.saveResults();
            localStorage.removeItem('exam_results');
          } catch(e) {}
        }
      }
    },

    async saveAppSetting(key, value) {
      await _supabase.from('app_settings').upsert({ key, value: String(value) });
    },

    saveResult() {
      if (!this.result) return;
      const name = this.studentUser ? this.studentUser.name : this.studentName;
      const email = this.studentUser ? this.studentUser.email : this.studentEmail;
      const classId = this.studentClassId || (this.classes[0] && this.classes[0].id) || 'default';
      const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        theme: this.freeTalkMode ? (this.freeTalkTopic.trim() || 'フリートーク') : this.settings.theme,
        studentName: name || '（未入力）',
        studentEmail: email || '',
        classId: classId,
        testId: this.activeTestId,
        published: false,
        totalScore: this.result.totalScore,
        criteria: this.result.criteria,
        questionScores: this.result.questionScores || [],
        overallComment: this.result.overallComment,
        improvements: this.result.improvements || [],
        aiScore: {
          totalScore: this.result.totalScore,
          criteria: JSON.parse(JSON.stringify(this.result.criteria)),
          questionScores: JSON.parse(JSON.stringify(this.result.questionScores || [])),
          overallComment: this.result.overallComment,
          improvements: JSON.parse(JSON.stringify(this.result.improvements || [])),
        },
        adminScore: null,
        focusViolationCount: this.focusViolationCount,
        focusViolationFlagged: this.focusViolationFlagged,
        focusViolations: JSON.parse(JSON.stringify(this.focusViolations)),
        conversationLog: JSON.parse(JSON.stringify(this.messages)),
      };
      this.examResults.push(entry);
      this.saveResults().then(() => {
        // Also fetch to ensure any remote changes are synced
        if (this.fetchExamResults) this.fetchExamResults();
      });
    },

    downloadSingleResult(r) {
      if (!r) return;
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const dateStr = new Date(r.date).toLocaleString('ja-JP');
      const score = r.adminScore || r;
      const csvRows = [];

      // --- 会話ログセクション ---
      csvRows.push(['日時', '受験者名', 'メールアドレス', 'テーマ', 'メッセージ番号', '発話者', '内容'].map(q).join(','));
      (r.conversationLog || []).forEach((msg, i) => {
        csvRows.push([
          dateStr,
          r.studentName || '',
          r.studentEmail || '',
          r.theme || '',
          i + 1,
          msg.role === 'user' ? '受験者' : 'AI試験官',
          msg.content || ''
        ].map(q).join(','));
      });

      // --- 1行空けて採点結果セクション ---
      csvRows.push('');
      csvRows.push([q('ラベル'), q('内容')].join(','));
      csvRows.push([q('日時'),           q(dateStr)].join(','));
      csvRows.push([q('受験者名'),       q(r.studentName || '')].join(','));
      csvRows.push([q('メールアドレス'), q(r.studentEmail || '')].join(','));
      csvRows.push([q('テーマ'),         q(r.theme || '')].join(','));
      csvRows.push([q('合計点'),         q(score.totalScore ?? r.totalScore)].join(','));
      (score.criteria || r.criteria || []).forEach(c => {
        csvRows.push([q(c.name + '_点数'),    q(`${c.score}/${c.maxScore}`)].join(','));
        if (c.comment) csvRows.push([q(c.name + '_コメント'), q(c.comment)].join(','));
      });
      (r.questionScores || []).forEach((qs, i) => {
        csvRows.push([q(`問${i + 1}_点数`), q(`${qs.score}/${qs.maxScore}`)].join(','));
      });
      csvRows.push([q('総合コメント'), q(score.overallComment || r.overallComment || '')].join(','));
      (r.improvements || []).forEach((imp, i) => {
        csvRows.push([q(`改善点${i + 1}`), q(imp)].join(','));
      });

      const csv = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const name = (r.studentName || '受験者').replace(/\s/g, '_');
      const date = new Date(r.date).toISOString().slice(0, 10);
      a.download = `採点結果_${name}_${date}.csv`;
      a.click();
    },

    exportAllResults() {
      if (!this.examResults.length) return;
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const csvRows = [];

      this.examResults.forEach((r, idx) => {
        const dateStr = new Date(r.date).toLocaleString('ja-JP');
        const score = r.adminScore || r;

        // --- 会話ログセクション ---
        // ヘッダーは各受験者ブロックの先頭に出力
        csvRows.push(['日時', '受験者名', 'メールアドレス', 'テーマ', 'メッセージ番号', '発話者', '内容'].map(q).join(','));
        (r.conversationLog || []).forEach((msg, i) => {
          csvRows.push([
            dateStr,
            r.studentName || '',
            r.studentEmail || '',
            r.theme || '',
            i + 1,
            msg.role === 'user' ? '受験者' : 'AI試験官',
            msg.content || ''
          ].map(q).join(','));
        });

        // --- 1行空けて採点結果セクション ---
        csvRows.push('');
        csvRows.push([q('ラベル'), q('内容')].join(','));
        csvRows.push([q('日時'),         q(dateStr)].join(','));
        csvRows.push([q('受験者名'),     q(r.studentName || '')].join(','));
        csvRows.push([q('メールアドレス'), q(r.studentEmail || '')].join(','));
        csvRows.push([q('テーマ'),       q(r.theme || '')].join(','));
        csvRows.push([q('合計点'),       q(score.totalScore ?? r.totalScore)].join(','));
        (score.criteria || r.criteria || []).forEach(c => {
          csvRows.push([q(c.name + '_点数'),    q(`${c.score}/${c.maxScore}`)].join(','));
          if (c.comment) csvRows.push([q(c.name + '_コメント'), q(c.comment)].join(','));
        });
        (r.questionScores || []).forEach((qs, i) => {
          csvRows.push([q(`問${i + 1}_点数`), q(`${qs.score}/${qs.maxScore}`)].join(','));
        });
        csvRows.push([q('総合コメント'), q(score.overallComment || r.overallComment || '')].join(','));
        (r.improvements || []).forEach((imp, i) => {
          csvRows.push([q(`改善点${i + 1}`), q(imp)].join(','));
        });

        // 受験者間の区切り（最後以外）
        if (idx < this.examResults.length - 1) {
          csvRows.push('');
          csvRows.push('');
        }
      });

      const csv = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '採点結果一覧_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
    },

    exportConversationLogs() {
      const results = this.examResults.filter(r => r.conversationLog && r.conversationLog.length > 0);
      if (!results.length) { alert('ダウンロードできる会話ログがありません'); return; }
      const headers = ['日時', '受験者名', 'メールアドレス', 'テーマ', 'メッセージ番号', '発話者', '内容'];
      const rows = [];
      results.forEach(r => {
        (r.conversationLog || []).forEach((msg, i) => {
          rows.push([
            new Date(r.date).toLocaleString('ja-JP'),
            r.studentName || '',
            r.studentEmail || '',
            r.theme || '',
            i + 1,
            msg.role === 'user' ? '受験者' : 'AI試験官',
            msg.content || ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });
      });
      const csv = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '会話ログ一覧_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
    },

    async signOutStudent() {
      await _supabase.auth.signOut();
      this.studentUser = null;
      this.studentName = '';
      this.studentEmail = '';
      this.studentNameConfirmed = false;
      if (this.page === 'mode-select') this.page = 'student';
    },

    async fetchModels() {
      if (!this.apiKey) return;
      this.fetchingModels = true;
      // Free-tier text generation models (RPM > 0 in Google AI Studio free plan)
      const FREE_MODELS = [
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-3-flash',
        'gemini-2.5-flash',
      ];

      // Helper: fetch model list for a given API version
      const fetchForVersion = async (ver) => {
        const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${this.apiKey}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.models || null;
      };

      try {
        // ── 1. Fetch text models from v1beta ──────────────────────────────
        const models = await fetchForVersion('v1beta');
        if (!models) { alert('❌ モデル取得失敗'); return; }

        const filtered = models
          .filter(m =>
            m.supportedGenerationMethods &&
            m.supportedGenerationMethods.includes('generateContent') &&
            FREE_MODELS.some(fid => m.name.replace('models/', '').startsWith(fid))
          )
          .map(m => {
            const id = m.name.replace('models/', '');
            const rpd = { 'gemini-3.1-flash-lite': 500, 'gemini-2.5-flash-lite': 20, 'gemini-3-flash': 20, 'gemini-2.5-flash': 20 };
            const baseId = FREE_MODELS.find(fid => id.startsWith(fid)) || id;
            const rpdLabel = rpd[baseId] ? `（RPD:${rpd[baseId]}）` : '';
            return { id, name: m.name, label: `${id}${rpdLabel}` };
          })
          .sort((a, b) =>
            FREE_MODELS.findIndex(f => a.id.startsWith(f)) - FREE_MODELS.findIndex(f => b.id.startsWith(f))
          );
        this.availableModels = filtered.length > 0 ? filtered : [];
        const found = filtered.find(m => m.id === this.selectedModel);
        if (!found && filtered.length > 0) this.selectedModel = filtered[0].id;

        // ── 2. Detect Live API (bidiGenerateContent) models ─────────────
        const allLiveModels = [];
        for (const ver of ['v1beta', 'v1alpha']) {
          const vModels = ver === 'v1beta' ? models : await fetchForVersion('v1alpha');
          if (!vModels) continue;
          const liveModels = vModels.filter(m =>
            m.supportedGenerationMethods &&
            m.supportedGenerationMethods.includes('bidiGenerateContent')
          );
          for (const m of liveModels) {
            const id = m.name.replace('models/', '');
            // Avoid duplicates (same model might appear in both versions)
            if (!allLiveModels.find(x => x.id === id)) {
              allLiveModels.push({ id, label: `${id}（${ver}）`, version: ver });
            }
          }
        }
        this.availableLiveModels = allLiveModels;

        if (allLiveModels.length > 0) {
          // Prefer models with "native-audio" or "live" in name, otherwise first
          const preferred = allLiveModels.find(m =>
            m.id.includes('native-audio') || m.id.includes('live')
          ) || allLiveModels[0];
          this.voiceModel = preferred.id;
          this.liveApiVersion = preferred.version;
          localStorage.setItem('voice_model', preferred.id);
          localStorage.setItem('live_api_version', preferred.version);
          alert(`✅ テキスト: ${filtered.length}個\n🎤 音声モデル: ${allLiveModels.length}個取得（自動選択: ${preferred.id}）`);
        } else {
          alert(`✅ テキスト: ${filtered.length}個\n⚠️ Live API対応モデルが見つかりませんでした。`);
        }

      } catch(e) {
        alert('❌ モデル取得エラー: ' + e.message);
      } finally {
        this.fetchingModels = false;
      }
    },

    addCriterion() {
      this.settings.criteria.push({ name: '', description: '' });
    },

    removeCriterion(index) {
      if (this.settings.criteria.length > 1) {
        this.settings.criteria.splice(index, 1);
      }
    },

    addQuestion() {
      this.settings.questions.push({ id: Date.now() + Math.random(), question: '', expectedAnswer: '', notes: '', difficulty: null });
    },

    removeQuestion(index) {
      this.settings.questions.splice(index, 1);
    },

    importQuestionsFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      const parse = (rows) => {
        const parsed = rows
          .filter(r => r['問題'] || r['question'])
          .map(r => {
            const diffRaw = r['難易度'] || r['difficulty'] || '';
            const diff = parseInt(diffRaw);
            return {
              id: Date.now() + Math.random(),
              question:        r['問題']        || r['question']        || '',
              expectedAnswer:  r['想定する答え'] || r['expectedAnswer']  || '',
              notes:           r['備考']         || r['notes']           || '',
              difficulty:      (diff >= 1 && diff <= 5) ? diff : null,
            };
          });
        if (parsed.length === 0) { alert('問題が見つかりませんでした。\nヘッダー行に「問題」「想定する答え」「備考」を含めてください。'); return; }
        if (confirm(`${parsed.length}件の問題を取り込みます。既存の問題リストを置き換えますか？`)) {
          this.settings.questions = parsed;
          alert(`${parsed.length}件の問題を取り込みました。`);
        }
        event.target.value = '';
      };
      if (ext === 'csv') {
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => parse(r.data) });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          parse(XLSX.utils.sheet_to_json(ws));
        };
        reader.readAsBinaryString(file);
      } else {
        alert('.csv、.xlsx、.xls ファイルを選択してください。');
      }
    },

    exportQuestionsCSV() {
      const header = '問題,想定する答え,備考,難易度\n';
      const rows = this.settings.questions.map(q =>
        [q.question, q.expectedAnswer, q.notes, q.difficulty || ''].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',')
      ).join('\n');
      const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '問題リスト.csv';
      a.click();
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
    }
  };
};
