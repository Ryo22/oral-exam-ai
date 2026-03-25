// Configure marked once globally
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true });
}

// Supabase client
const SUPABASE_URL = 'https://enroevnddicemufefguz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucm9ldm5kZGljZW11ZmVmZ3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNzgyMjQsImV4cCI6MjA4OTY1NDIyNH0.iQExh16Pebio4pI3NXGU4sC4GCiBV8UC1cOc9bWHfRc';
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function app() {
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  return {
    page: 'student',
    isAdmin: false,
    adminLoginInput: '',
    adminLoginError: false,
    adminNewPassword: '',
    adminTab: 'tests',  // 'tests' | 'system'
    adminPassword: 'admin',
    get archivedTests() {
      const activeIds = new Set(this.tests.map(t => t.id));
      const map = new Map();
      this.examResults.forEach(r => {
        if (r.testId && !activeIds.has(r.testId)) {
          if (!map.has(r.testId)) {
            map.set(r.testId, { id: r.testId, name: r.testName || r.testId, results: [] });
          }
          map.get(r.testId).results.push(r);
        }
      });
      return [...map.values()].sort((a, b) => {
        const latestA = Math.max(...a.results.map(r => new Date(r.date)));
        const latestB = Math.max(...b.results.map(r => new Date(r.date)));
        return latestB - latestA;
      });
    },

    async restoreTest(archivedTest) {
      if (!confirm(`「${archivedTest.name}」を復元しますか？\nクラス・テスト管理に追加されます（テーマ等の設定は初期状態になります）。`)) return;
      const defaultSettings = {
        theme: '', criteria: [{ name: '理解度', description: '', maxScore: 100 }],
        questions: [], autoQuestionCount: 5, difficultyDistribution: [0,0,0,0,0], learningMode: false
      };
      this.tests.push({ id: archivedTest.id, name: archivedTest.name, classIds: [], status: 'ended', settings: defaultSettings });
      await this.saveTestsToStorage();
      alert(`「${archivedTest.name}」を復元しました。クラス・テスト管理タブで確認できます。`);
    },

    get filteredResults() {
      const classId = this.adminFilterClassId || 'all';
      const testName = this.adminFilterTest; // Use test_name now
      const searchText = (this.adminFilterText || '').toLowerCase();

      return [...this.examResults]
        .filter(r => {
          const matchClass = classId === 'all' || r.classId === classId;
          const matchTest = !testName || r.testId === testName || r.testName === testName;
          const matchText = !searchText || 
                            (r.studentName || '').toLowerCase().includes(searchText) || 
                            (r.studentEmail || '').toLowerCase().includes(searchText);
          return matchClass && matchTest && matchText;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    examResults: [],
    apiKey: '',
    selectedModel: 'gemini-2.0-flash-lite',
    availableModels: [],
    fetchingModels: false,
    settings: {
      theme: '',
      criteria: [
        { name: '理解度', description: '概念を正確に理解し自分の言葉で説明できるか' },
        { name: '論理構成', description: '論理的に整理された回答ができているか' },
        { name: '表現力', description: '適切な用語を使い明確に伝えられているか' }
      ],
      questions: [],
      autoQuestionCount: 5,
      difficultyDistribution: [0, 0, 0, 0, 0]
    },
    messages: [],
    inputText: '',
    isLoading: false,
    isScoring: false,
    examStarted: false,
    // ---- Voice mode (Gemini Live API) ----
    voiceMode: false,
    voiceModel: 'gemini-2.5-flash-native-audio-latest',
    liveApiVersion: 'v1beta',
    availableLiveModels: [],  // [{id, label, version}] — populated by fetchModels()
    liveWs: null,
    liveStatus: 'idle',   // 'idle'|'connecting'|'ready'|'listening'|'ai_speaking'|'error'
    liveErrorMsg: '',
    voiceMicStream: null,
    voiceAudioCtx: null,  // AudioContext for mic capture (16 kHz)
    voicePlayCtx: null,   // AudioContext for playback (24 kHz)
    voiceScheduledTime: 0,
    voiceAudioQueue: [],
    voiceIsPlaying: false,
    voiceCurrentAiText: '',
    voiceMuted: false,
    voicePlaybackRate: 1.0,       // AI speech playback speed (0.5x – 2.0x)
    voiceSilenceDelaySec: 0.8,    // seconds of silence before AI responds
    voiceVoiceName: 'Kore',       // Gemini Live API voice name
    showVoiceSettings: false,     // toggle voice advanced settings panel
    showEndConfirm: false,
    // Admin filters
    adminFilterTest: '',
    adminFilterText: '',
    isGeneratingFromDoc: false,
    saved: false,
    showScoreToStudent: true,
    showCommentToStudent: true,
    allowStudentHistory: false,
    examResults: [],
    realtimeChannel: null,
    adminResultsSubTab: 'roster',
    roster: [],
    rosterFilterClassId: 'all',
    newRosterEntry: { classId: '', studentNumber: '', name: '', email: '' },
    classes: [],
    studentClassId: '',
    adminFilterClassId: 'all',
    editingClassId: null,
    editingClassName: '',
    tests: [],
    activeTestId: '',
    editingTestId: null,
    editingTestName: '',
    editingResultId: null,
    editingData: null,
    rosterSelectedResult: null,
    rosterImportPreview: [],
    rosterImportShowing: false,
    rosterEditingId: null,
    rosterEditingData: {},
    rosterBulkEdit: false,
    rosterBulkEditData: {},
    rosterTestHistoryResults: [],
    rosterTestHistoryVisible: false,
    rosterAiStudent: null,
    rosterAiMessages: [],
    rosterAiInput: '',
    rosterAiLoading: false,
    rosterAiVisible: false,
    _rosterAiSystemContext: '',
    archivedTestsVisible: false,
    checkResultsName: '',
    studentPastResults: [],
    showPastResults: false,
    freeTalkMode: false,
    freeTalkTopic: '',
    mypageSelectedResult: null,
    mypageShowLog: false,
    mypageShowChat: false,
    mypageChatMessages: [],
    mypageChatInput: '',
    mypageChatLoading: false,
    _mypageChatSystemContext: '',
    studentUser: null,
    studentName: '',
    studentEmail: '',
    studentNameConfirmed: false,
        // Auth state
    // Auth Flow State
    authMode: 'login', // 'login' | 'signup'
    authEmail: '',
    authPassword: '',
    authError: '',
    currentUser: null,
    userRole: 'student', // 'student' | 'teacher' | 'admin'
    authLoading: true,
    googleClientId: '',
    googlePickerApiKey: '',
    googlePickerClientId: '',
    _gisToken: null,
    _pickerApiLoaded: false,
    focusMonitoringEnabled: false,
    focusViolationCount: 0,
    focusViolations: [],
    focusViolationFlagged: false,
    showViolationWarning: false,
    _pendingTestIdFromUrl: '',
    _pendingClassIdFromUrl: '',
    _pendingUserText: '',
    _focusHandlers: null,
    _examProgressId: null,
    examProgressSaved: false,
    examRestoredAt: null,

    async handleSessionStart(user) {
      this.currentUser = user;
      this.studentUser = { name: user.user_metadata?.name || user.email.split('@')[0], email: user.email };
      this.studentName = this.studentUser.name;
      this.studentEmail = this.studentUser.email;
      this.studentNameConfirmed = true;

      // Fetch role safely from user_roles table
      try {
        let role = 'student';
        const { data: roleData, error } = await _supabase.from('user_roles').select('role, is_admin').eq('user_id', user.id).single();
        if (!error && roleData) {
          if (roleData.is_admin === true) {
            role = 'admin';
          } else if (roleData.role !== 'student') {
            role = roleData.role;
          }
        }

        // Override with authorized_emails if role is still student
        if (role === 'student') {
          const { data: authEmailData, error: authEmailError } = await _supabase.from('authorized_emails').select('role').eq('email', user.email).single();
          if (!authEmailError && authEmailData) {
            role = authEmailData.role;
          }
        }
        
        this.userRole = role;
      } catch(e) {
        this.userRole = 'student';
      }
      
      // Check if we should jump to student page due to URL params
      const hasUrlParams = !!(this._pendingTestIdFromUrl || this._pendingClassIdFromUrl);
      if (hasUrlParams) {
        this.page = 'student';
      } else {
        this.page = (this.userRole === 'admin' || this.userRole === 'teacher') ? 'admin' : 'student';
      }
      
      // Load all settings/data from Supabase again after successful login to ensure everything is fetched
      if (this.userRole === 'admin' || this.userRole === 'teacher') {
        await this.loadFromSupabase();
        this.subscribeToResults();
      }
      
      this.authLoading = false;
    },

    async adminLogout() {
      await this.logoutSystem();
    },

    async submitAuth() {
      if (!this.authEmail || !this.authPassword) return;
      this.authError = '';
      const APP_URL = 'https://ryo22.github.io/oral-exam-ai/';
      try {
        if (this.authMode === 'signup') {
          const { error } = await _supabase.auth.signUp({
            email: this.authEmail,
            password: this.authPassword,
            options: { emailRedirectTo: APP_URL }
          });
          if (error) throw error;
          alert('確認メールを送信しました。メール内のリンクをクリックし、このページへ戻ってからログインしてください。');
          this.authMode = 'login';
        } else {
          const { error } = await _supabase.auth.signInWithPassword({ email: this.authEmail, password: this.authPassword });
          if (error) throw error;
        }
      } catch (err) {
        this.authError = err.message || 'エラーが発生しました';
      }
    },
    async logoutSystem() {
      if (_supabase) await _supabase.auth.signOut();
      this.currentUser = null;
      this.userRole = 'student';
      this.page = 'student';
      if (this.realtimeChannel) {
        _supabase.removeChannel(this.realtimeChannel);
        this.realtimeChannel = null;
      }
    },

    async loginWithGoogle() {
      if (typeof _supabase === 'undefined' || !_supabase) return alert('Supabaseが設定されていません。');
      await _supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://ryo22.github.io/oral-exam-ai/' }
      });
    },

    async init() {
      // --- Capture URL params FIRST (before Supabase overwrites settings) ---
      try {
        const urlParams = new URLSearchParams(window.location.search);
        this._pendingTestIdFromUrl = urlParams.get('test') || '';
        this._pendingClassIdFromUrl = urlParams.get('class') || '';
      } catch(e) {}

      // Check auth session for Google Auth
      if (typeof _supabase !== 'undefined' && _supabase) {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session?.user) {
          await this.handleSessionStart(session.user);
        }
        
        _supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            await this.handleSessionStart(session.user);
          } else {
            this.currentUser = null;
            this.studentUser = null;
            this.userRole = 'student';
            this.isGoogleAdmin = false;
            this.studentNameConfirmed = false;
            if (this.realtimeChannel) {
              _supabase.removeChannel(this.realtimeChannel);
              this.realtimeChannel = null;
            }
          }
        });
      }
      this.authLoading = false;

      // Local settings (device-specific, keep in localStorage)
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) this.apiKey = storedKey;
      const storedVoiceModel = localStorage.getItem('voice_model');
      if (storedVoiceModel) this.voiceModel = storedVoiceModel;
      const storedLiveApiVer = localStorage.getItem('live_api_version');
      if (storedLiveApiVer) this.liveApiVersion = storedLiveApiVer;
      if (this.liveApiVersion === 'v1alpha') {
        this.liveApiVersion = 'v1beta';
        localStorage.setItem('live_api_version', 'v1beta');
      }

      const storedModel = localStorage.getItem('gemini_model');
      const deprecatedModels = [
        'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro',
        'gemini-2.5-flash-preview-04-17', 'gemini-3-flash', 'gemini-2.5-flash-lite',
      ];
      if (storedModel && !deprecatedModels.includes(storedModel)) {
        this.selectedModel = storedModel;
      } else {
        this.selectedModel = 'gemini-2.0-flash-lite';
        localStorage.removeItem('gemini_model');
      }

      // Load shared data from Supabase (does NOT overwrite this.settings when URL params are present)
      await this.loadFromSupabase();

      // --- Resolve URL params AFTER data is loaded ---
      try {
        const testId = this._pendingTestIdFromUrl;
        const classId = this._pendingClassIdFromUrl;

        if (testId || classId) {
          this.page = 'student';
        }

        if (classId && this.classes.find(c => c.id === classId)) {
          this.studentClassId = classId;
        }

        if (testId) {
          // Load specific test by URL
          const t = this.tests.find(t => t.id === testId);
          if (t) {
            this.selectTestForStudent(testId);
          }
        } else if (classId) {
          // Auto-select the only test for this class
          const classTests = this.tests.filter(t => t.classIds && t.classIds.includes(classId));
          if (classTests.length === 1) {
            this.selectTestForStudent(classTests[0].id);
          }
          // If multiple tests, student will see the selector dropdown
        }
      } catch(e) {}
    },

    get availableTestsForStudent() {
      return this.tests.filter(t => 
        t.status === 'published' && 
        (!t.classIds || t.classIds.length === 0 || (this.studentClassId && t.classIds.includes(this.studentClassId)))
      );
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
        this.loadFromSupabase();
      } else {
        this.adminLoginError = true;
      }
    },

    adminLogout() {
      this.isAdmin = false;
      this.page = 'student';
    },

    changeAdminPassword() {
      if (!this.adminNewPassword.trim()) return;
      this.adminPassword = this.adminNewPassword.trim();
      this.saveAppSetting('admin_password', this.adminPassword);
      this.adminNewPassword = '';
      alert('パスワードを変更しました');
    },

    // Class management
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

    async addTeacher() {
      if (!this.newTeacherEmail) return;
      const email = this.newTeacherEmail.trim().toLowerCase();
      if (this.authorizedEmails.find(e => e.email === email)) return;
      const entry = { email, role: 'teacher' };
      this.authorizedEmails.push(entry);
      this.newTeacherEmail = '';
      const { error } = await _supabase.from('authorized_emails').upsert([entry]);
      if (error) alert('教員の登録に失敗しました。');
    },

    async removeTeacher(email) {
      if (!confirm('この教員アドレスを削除しますか？')) return;
      this.authorizedEmails = this.authorizedEmails.filter(e => e.email !== email);
      await _supabase.from('authorized_emails').delete().eq('email', email);
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
      if (!confirm('このクラスを削除しますか？\nクラスに割り当てられたテストの割り当てたては解除されます。')) return;
      // Unassign class from all tests
      this.tests.forEach(t => {
        if (t.classIds && t.classIds.includes(id)) {
          t.classIds = t.classIds.filter(cid => cid !== id);
        }
      });
      this.classes = this.classes.filter(c => c.id !== id);
      this.saveClassesToStorage();
      this.saveTestsToStorage();
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

    // Test management
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
      if (error) {
        console.error('Failed to save tests:', error);
        alert('テストの保存に失敗しました（権限がない可能性があります）\n' + error.message);
      }
      // Delete tests that no longer exist
      if (this.tests.length > 0) {
        const ids = this.tests.map(t => t.id);
        await _supabase.from('tests').delete().not('id', 'in', ids);
      } else {
        await _supabase.from('tests').delete().neq('id', '');
      }
    },

    switchTest(id) {
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
      this.saveTestsToStorage();
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
      if (existed && !this.tests.some(t => t.id === id)) this.page = 'admin';
    },

    async deleteTest(id) {
      const hasResults = this.examResults.some(r => r.testId === id);
      if (hasResults && !confirm('このテストには採点結果があります。本当に削除しますか？')) return;
      if (!hasResults && !confirm('このテストを削除しますか？')) return;
      this.tests = this.tests.filter(t => t.id !== id);
      if (this.activeTestId === id) {
        if (this.tests.length > 0) this.switchTest(this.tests[0].id);
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
      const { error } = await _supabase.from('tests').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete test:', error);
        alert('テストの削除に失敗しました。\n' + error.message + '\n\nSupabaseのRLSポリシーを確認してください。');
        return;
      }
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

    setTestStatus(id, status) {
      const t = this.tests.find(x => x.id === id);
      if (!t) return;
      t.status = status;
      this.saveTestsToStorage();
    },

    toggleTestPublished(id) {
      // keep alias for HTML backward compat -- cycle: draft -> published -> ended -> draft
      const t = this.tests.find(x => x.id === id);
      if (!t) return;
      if (t.status === 'draft') t.status = 'published';
      else if (t.status === 'published') t.status = 'ended';
      else t.status = 'draft';
      this.saveTestsToStorage();
    },

    getTestQuestionCount(t) {
      if (!t || !t.settings || !t.settings.questions) return 0;
      return t.settings.questions.filter(q => q && q.question && String(q.question).trim() !== '').length;
    },

    // Result publishing & editing
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


    recalculateEditTotal() {
      if (!this.editingData) return;
      let total = 0;
      if (this.editingData.criteria && this.editingData.criteria.length > 0) {
        // Sum criteria scores (ensure numeric)
        total = this.editingData.criteria.reduce((sum, c) => sum + (Number(c.score) || 0), 0);
      } else if (this.editingData.questionScores && this.editingData.questionScores.length > 0) {
        // Fallback to question scores
        total = this.editingData.questionScores.reduce((sum, q) => sum + (Number(q.score) || 0), 0);
      }
      // Round to nearest integer if needed
      this.editingData.totalScore = Math.round(total);
    },

    // Student: check past results
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
        test_name: r.testName || '',
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
        const { error } = await _supabase.from('exam_results').upsert(rows);
        if (error) console.error('Failed to save exam results:', error);
      }
    },

    _mapResultRow(r) {
      return {
        id: r.id, testId: r.test_id, testName: r.test_name || '',
        classId: r.class_id, studentName: r.student_name, studentEmail: r.student_email,
        theme: r.theme, date: r.date, published: r.published, totalScore: r.total_score,
        criteria: r.criteria, questionScores: r.question_scores, overallComment: r.overall_comment,
        improvements: r.improvements, aiScore: r.ai_score, adminScore: r.admin_score,
        focusViolationCount: r.focus_violation_count || 0,
        focusViolationFlagged: r.focus_violation_flagged || false,
        focusViolations: r.focus_violations || [], conversationLog: r.conversation_log || []
      };
    },

    async loadExamResults() {
      try {
        const { data: resultsData, error } = await _supabase.from('exam_results').select('*').order('date', { ascending: false });
        if (!error && resultsData) {
          this.examResults = resultsData.map(r => this._mapResultRow(r));
        }
      } catch(e) { console.error('Results load failed:', e); }

      // Supabase Realtime: 試験終了時にリアルタイム反映（ポーリング不要）
      if (!this._realtimeResultsChannel) {
        this._realtimeResultsChannel = _supabase
          .channel('exam_results_live')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'exam_results' }, (payload) => {
            const r = payload.new;
            if (!this.examResults.find(e => String(e.id) === String(r.id))) {
              this.examResults.unshift(this._mapResultRow(r));
            }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_results' }, (payload) => {
            const r = payload.new;
            const idx = this.examResults.findIndex(e => String(e.id) === String(r.id));
            if (idx !== -1) this.examResults.splice(idx, 1, this._mapResultRow(r));
          })
          .subscribe();
      }
    },

    async addRosterStudent() {
      if (!this.newRosterEntry.name.trim()) return;
      const row = {
        class_id: this.newRosterEntry.classId || (this.classes[0]?.id || null) || null,
        student_number: this.newRosterEntry.studentNumber.trim() || null,
        name: this.newRosterEntry.name.trim(),
        email: this.newRosterEntry.email.trim() || null,
      };
      const { data, error } = await _supabase.from('roster').insert(row).select().single();
      if (!error && data) {
        this.roster.push({ id: data.id, classId: data.class_id, studentNumber: data.student_number || '', name: data.name, email: data.email || '' });
      }
      this.newRosterEntry = { classId: this.newRosterEntry.classId, studentNumber: '', name: '', email: '' };
    },

    async deleteRosterStudent(id) {
      await _supabase.from('roster').delete().eq('id', id);
      this.roster = this.roster.filter(s => s.id !== id);
    },

    startEditRosterStudent(student) {
      this.rosterEditingId = student.id;
      this.rosterEditingData = { classId: student.classId || '', studentNumber: student.studentNumber || '', name: student.name, email: student.email || '' };
    },

    cancelEditRosterStudent() {
      this.rosterEditingId = null;
      this.rosterEditingData = {};
    },

    startBulkEdit() {
      this.rosterBulkEditData = {};
      this.roster.forEach(s => {
        this.rosterBulkEditData[s.id] = {
          classId: s.classId || '',
          studentNumber: s.studentNumber || '',
          name: s.name,
          email: s.email || '',
        };
      });
      this.rosterBulkEdit = true;
      this.rosterEditingId = null;
    },

    cancelBulkEdit() {
      this.rosterBulkEdit = false;
      this.rosterBulkEditData = {};
    },

    async saveBulkEdit() {
      const updates = this.roster.map(async s => {
        const d = this.rosterBulkEditData[s.id];
        if (!d || !d.name.trim()) return;
        const { error } = await _supabase.from('roster').update({
          class_id: d.classId || null,
          student_number: d.studentNumber || null,
          name: d.name.trim(),
          email: d.email?.trim() || null,
        }).eq('id', s.id);
        if (!error) {
          const idx = this.roster.findIndex(r => r.id === s.id);
          if (idx !== -1) {
            this.roster.splice(idx, 1, {
              ...this.roster[idx],
              classId: d.classId || null,
              studentNumber: d.studentNumber || '',
              name: d.name.trim(),
              email: d.email?.trim() || '',
            });
          }
        }
      });
      await Promise.all(updates);
      this.rosterBulkEdit = false;
      this.rosterBulkEditData = {};
    },

    async saveRosterStudent(id) {
      const d = this.rosterEditingData;
      if (!d.name.trim()) return;
      const { error } = await _supabase.from('roster').update({
        class_id: d.classId || null,
        student_number: d.studentNumber || null,
        name: d.name.trim(),
        email: d.email?.trim() || null,
      }).eq('id', id);
      if (!error) {
        const idx = this.roster.findIndex(s => s.id === id);
        if (idx !== -1) this.roster.splice(idx, 1, { ...this.roster[idx], classId: d.classId || null, studentNumber: d.studentNumber || '', name: d.name.trim(), email: d.email?.trim() || '' });
        this.rosterEditingId = null;
        this.rosterEditingData = {};
      }
    },

    importRosterFromFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let rows = [];
          if (file.name.endsWith('.csv')) {
            // CSV parse
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const colClass = header.findIndex(h => /クラス|class/i.test(h));
            const colNum = header.findIndex(h => /学籍番号|id|student.?number/i.test(h));
            const colName = header.findIndex(h => /氏名|名前|name/i.test(h));
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
              if (!cols[colName]?.trim()) continue;
              rows.push({
                className: colClass >= 0 ? cols[colClass] : '',
                studentNumber: colNum >= 0 ? cols[colNum] : '',
                name: cols[colName] || '',
                email: header.findIndex(h => /メール|email|mail/i.test(h)) >= 0 ? cols[header.findIndex(h => /メール|email|mail/i.test(h))] : '',
              });
            }
          } else {
            // Excel via SheetJS
            const wb = XLSX.read(e.target.result, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
            data.forEach(row => {
              const name = row['氏名'] || row['名前'] || row['name'] || row['Name'] || '';
              if (!name) return;
              rows.push({
                className: String(row['クラス'] || row['クラス名'] || row['class'] || ''),
                studentNumber: String(row['学籍番号'] || row['ID'] || row['id'] || ''),
                name: String(name),
                email: String(row['メール'] || row['メールアドレス'] || row['email'] || row['mail'] || ''),
              });
            });
          }
          // Resolve class names to IDs
          this.rosterImportPreview = rows.map(r => ({
            ...r,
            classId: this.classes.find(c => c.name === r.className)?.id || '',
          }));
          this.rosterImportShowing = true;
        } catch(err) {
          alert('ファイルの読み込みに失敗しました: ' + err.message);
        }
      };
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.readAsBinaryString(file);
      }
      event.target.value = '';
    },

    handleRosterPaste(event) {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text');
      if (!text.trim()) return;
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return;

      // Skip header row if it looks like one
      let startRow = 0;
      if (/氏名|名前|name|クラス|学籍/i.test(lines[0])) startRow = 1;

      const preview = [];
      for (let i = startRow; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        if (!cols.some(c => c)) continue;
        if (cols.length === 1) {
          preview.push({ className: '', studentNumber: '', name: cols[0], email: '' });
        } else if (cols.length === 2) {
          preview.push({ className: '', studentNumber: cols[0], name: cols[1], email: '' });
        } else if (cols.length === 3) {
          preview.push({ className: cols[0], studentNumber: cols[1], name: cols[2], email: '' });
        } else {
          preview.push({ className: cols[0], studentNumber: cols[1], name: cols[2], email: cols[3] });
        }
      }
      this.rosterImportPreview = preview
        .filter(r => r.name)
        .map(r => ({ ...r, classId: this.classes.find(c => c.name === r.className)?.id || '' }));
      if (this.rosterImportPreview.length > 0) this.rosterImportShowing = true;
    },

    async confirmRosterImport() {
      const rows = this.rosterImportPreview.filter(r => r.name.trim());
      if (!rows.length) return;
      const inserts = rows.map(r => ({
        class_id: r.classId || null,
        student_number: r.studentNumber || null,
        name: r.name.trim(),
        email: r.email?.trim() || null,
      }));
      const { data, error } = await _supabase.from('roster').insert(inserts).select();
      if (!error && data) {
        data.forEach(s => this.roster.push({
          id: s.id, classId: s.class_id, studentNumber: s.student_number || '', name: s.name, email: s.email || '',
        }));
      }
      this.rosterImportShowing = false;
      this.rosterImportPreview = [];
    },

    // 未登録受験者の行でインライン入力 → INSERT して正式登録
    async saveRosterStudentOrCreate(student) {
      const d = this.rosterEditingData;
      if (!d.name.trim()) return;
      if (student._unregistered) {
        const row = {
          class_id: d.classId || null,
          student_number: d.studentNumber || null,
          name: d.name.trim(),
          email: d.email?.trim() || null,
        };
        const { data, error } = await _supabase.from('roster').insert(row).select().single();
        if (!error && data) {
          this.roster.push({
            id: data.id,
            classId: data.class_id,
            studentNumber: data.student_number || '',
            name: data.name,
            email: data.email || '',
          });
        }
        this.rosterEditingId = null;
        this.rosterEditingData = {};
      } else {
        await this.saveRosterStudent(student.id);
      }
    },

    // 複数回受験：同テストの全結果を新しい順で返す
    getStudentTestResultAll(student, test) {
      return this.examResults
        .filter(r => {
          const match = student.email ? r.studentEmail === student.email : r.studentName === student.name;
          return match && r.testId === test.id;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // 教員向けAIチャット起動（学生の全試験結果を参照）
    async openRosterAiChat(student) {
      if (!this.apiKey) { alert('Gemini API Keyを設定してください。'); return; }
      this.rosterAiStudent = student;
      this.rosterAiMessages = [];
      this.rosterAiInput = '';
      this.rosterAiLoading = true;
      this.rosterAiVisible = true;

      const results = this.getRosterStudentResults(student);
      const className = this.classes.find(c => c.id === student.classId)?.name || '未割当';
      const resultText = results.length === 0 ? '受験記録なし' : results.map((r, i) => {
        const score = r.adminScore || r;
        const criteria = (score.criteria || []).map(c => `  ・${c.name}: ${c.score}/${c.maxScore}点 — ${c.comment || ''}`).join('\n');
        return `【受験${i + 1}: ${r.testName || r.testId}】
日時: ${new Date(r.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
合計: ${score.totalScore || r.totalScore}点/100点
${criteria}
総評: ${score.overallComment || r.overallComment || 'なし'}
改善点: ${(r.improvements || []).join(' / ') || 'なし'}`;
      }).join('\n\n');

      this._rosterAiSystemContext = `あなたは教育者のアシスタントAIです。以下の学生の試験履歴を参照して、教員からの質問に答えてください。学生の弱点分析、学習進捗の評価、次のステップへのアドバイスなどを行うことができます。

【学生情報】
氏名: ${student.name}
クラス: ${className}
学籍番号: ${student.studentNumber || 'なし'}
メール: ${student.email || 'なし'}

【試験履歴（計${results.length}件）】
${resultText}

---
教員が学生の指導に役立てるよう、具体的で実用的な情報を提供してください。`;

      const initialMsg = 'この学生の試験結果を踏まえ、現在の学力状況と今後の指導ポイントを教えてください。';
      const reply = await this.callGemini(this._rosterAiSystemContext, [{ role: 'user', content: initialMsg }]);
      this.rosterAiMessages = [
        { role: 'user', content: initialMsg },
        { role: 'assistant', content: reply || 'エラーが発生しました。APIキーまたはモデルを確認してください。' }
      ];
      this.rosterAiLoading = false;
      this.$nextTick(() => {
        const el = this.$refs.rosterAiChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },

    async sendRosterAiMessage() {
      const text = this.rosterAiInput.trim();
      if (!text || this.rosterAiLoading) return;
      this.rosterAiInput = '';
      this.rosterAiMessages.push({ role: 'user', content: text });
      this.rosterAiLoading = true;
      this.$nextTick(() => {
        const el = this.$refs.rosterAiChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
      const reply = await this.callGemini(this._rosterAiSystemContext, this.rosterAiMessages);
      this.rosterAiMessages.push({ role: 'assistant', content: reply || 'エラーが発生しました。' });
      this.rosterAiLoading = false;
      this.$nextTick(() => {
        const el = this.$refs.rosterAiChatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },

    getCombinedRoster() {
      // examResults に存在するが roster に登録されていない受験者を末尾に追加
      const seen = new Set();
      const unregistered = [];
      for (const r of this.examResults) {
        const key = r.studentEmail || r.studentName;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const inRoster = this.roster.some(s =>
          s.email ? s.email === r.studentEmail : s.name === r.studentName
        );
        if (!inRoster) {
          unregistered.push({
            id: 'unreg__' + key,
            classId: null,
            studentNumber: '',
            name: r.studentName || r.studentEmail || '',
            email: r.studentEmail || '',
            _unregistered: true,
          });
        }
      }
      return [...this.roster, ...unregistered];
    },

    addUnregisteredToRoster(student) {
      this.newRosterEntry = {
        classId: '',
        studentNumber: '',
        name: student.name,
        email: student.email,
      };
    },

    getRosterStudentResults(student) {
      return this.examResults
        .filter(r => student.email ? r.studentEmail === student.email : r.studentName === student.name)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    getStudentTestResult(student, test) {
      const results = this.examResults
        .filter(r => {
          const match = student.email ? r.studentEmail === student.email : r.studentName === student.name;
          return match && r.testId === test.id;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      return results[0] || null;
    },

    getTestNameById(testId) {
      return this.tests.find(t => t.id === testId)?.name || null;
    },

    async loadFromSupabase() {
      // Load app settings
      try {
        const { data: settingsData, error } = await _supabase.from('app_settings').select('*');
        if (!error && settingsData) {
          settingsData.forEach(({ key, value }) => {
            if (key === 'admin_password') this.adminPassword = value;
            if (key === 'google_client_id') this.googleClientId = value;
            if (key === 'google_picker_api_key') this.googlePickerApiKey = value;
            if (key === 'google_picker_client_id') this.googlePickerClientId = value;
            if (key === 'show_score_to_student') this.showScoreToStudent = value === 'true';
            if (key === 'show_comment_to_student') this.showCommentToStudent = value === 'true';
            if (key === 'allow_student_history') this.allowStudentHistory = value === 'true';
            if (key === 'focus_monitoring_enabled') this.focusMonitoringEnabled = value === 'true';
            if (key === 'gemini_api_key' && value) this.apiKey = value;
          });
        }
      } catch(e) { console.warn('app_settings load failed:', e); }

      // Load classes
      try {
        const { data: classesData, error } = await _supabase.from('classes').select('*').order('created_at');
        if (!error && classesData && classesData.length > 0) {
          this.classes = classesData.map(c => ({ id: c.id, name: c.name }));
        } else if (!error) {
          this.classes = [{ id: 'default', name: 'クラス1' }];
          await _supabase.from('classes').upsert([{ id: 'default', name: 'クラス1' }]);
        }
      } catch(e) { console.warn('classes load failed:', e); }

      // Load tests
      try {
        const { data: testsData, error } = await _supabase.from('tests').select('*').order('created_at');
        if (!error && testsData && testsData.length > 0) {
          this.tests = testsData.map(t => ({
            id: t.id,
            name: t.name,
            classId: t.class_id,
            classIds: Array.isArray(t.class_ids) ? t.class_ids : (t.class_ids ? JSON.parse(t.class_ids) : []),
            status: t.status || (t.published ? 'published' : 'draft'),
            settings: t.settings || {}
          }));
        } else if (!error) {
          this.tests = [{ id: 'test_default', name: 'テスト1', classIds: [], status: 'draft', settings: JSON.parse(JSON.stringify(this.settings)) }];
          const rows = this.tests.map(t => ({ id: t.id, name: t.name, status: t.status, settings: t.settings }));
          await _supabase.from('tests').upsert(rows);
        }
      } catch(e) { console.warn('tests load failed:', e); }

      // Load roster
      try {
        const { data: rosterData, error } = await _supabase.from('roster').select('*').order('created_at');
        if (!error && rosterData) {
          this.roster = rosterData.map(s => ({
            id: s.id,
            classId: s.class_id,
            studentNumber: s.student_number || '',
            name: s.name,
            email: s.email || '',
          }));
        }
      } catch(e) { console.warn('roster load failed:', e); }

      await this.loadExamResults();
    },

    async saveAppSetting(key, value) {
      await _supabase.from('app_settings').upsert({ key, value: String(value) });
    },

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
        testName: this.tests.find(t => t.id === this.activeTestId)?.name || '',
        published: this.showScoreToStudent || false,
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
      this.examResults.unshift(entry);
      this.saveResults().then(() => {
        // Fetch to ensure sync
        this.loadExamResults();
      });
    },

    downloadSingleResult(r) {
      if (!r) return;
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const dateStr = new Date(r.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
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
      const date = new Date(r.date).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      a.download = `採点結果_${name}_${date}.csv`;
      a.click();
    },

    exportAllResults() {
      if (!this.examResults.length) return;
      const q = v => `"${String(v).replace(/"/g, '""')}"`;
      const csvRows = [];

      this.examResults.forEach((r, idx) => {
        const dateStr = new Date(r.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
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
            new Date(r.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
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
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.5-pro-preview',
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
            const rpd = { 'gemini-3.1-flash-lite': 500, 'gemini-2.0-flash-lite': 1500, 'gemini-2.0-flash': 1500, 'gemini-2.5-flash': 500, 'gemini-2.5-pro-preview': 25 };
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
        // フェッチ後の確定モデルを保存（次回起動時にデフォルトとして使用）
        localStorage.setItem('gemini_model', this.selectedModel);

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

    // =============================================
    // VOICE MODE — Gemini Live API
    // =============================================

    // ---- Audio helpers ----
    _float32ToPCM16(f32) {
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return i16;
    },
    _bufToBase64(buf) {
      let b = ''; const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i++) b += String.fromCharCode(u8[i]);
      return btoa(b);
    },
    _base64ToBuf(b64) {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8.buffer;
    },

    // ---- Connect to Gemini Live API ----
    async initLiveSession() {
      this.liveStatus = 'connecting';
      // 選択済みモデルに対応するAPIバージョンを優先的に使用
      // fetchModels() で自動検出済みなら availableLiveModels から取得、なければ liveApiVersion を使用
      const detectedModel = this.availableLiveModels.find(m => m.id === this.voiceModel);
      const apiVersion = detectedModel?.version || this.liveApiVersion || 'v1beta';
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      try {
        this.liveWs = new WebSocket(wsUrl);
      } catch(e) {
        alert('Live API WebSocket の接続に失敗しました: ' + e.message);
        this.liveStatus = 'error'; return;
      }

      this.liveWs.onopen = () => {
        const setup = {
          setup: {
            model: `models/${this.voiceModel}`,
            system_instruction: { parts: [{ text: this.buildSystemPrompt() }] },
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: { voice_config: { prebuilt_voice_config: { voice_name: this.voiceVoiceName } } },
              thinking_config: { thinking_budget: 0 }
            },
            input_audio_transcription: {},
            output_audio_transcription: {},
            realtime_input_config: {
              automatic_activity_detection: {
                silence_duration_ms: Math.round(this.voiceSilenceDelaySec * 1000)
              }
            }
          }
        };
        this.liveWs.send(JSON.stringify(setup));
      };

      this.liveWs.onmessage = async (event) => {
        let data;
        try {
          const text = event.data instanceof Blob ? await event.data.text() : event.data;
          data = JSON.parse(text);
        } catch(e) { return; }

        // Setup complete → start mic and kick off conversation
        if (data.setupComplete) {
          this.liveStatus = 'ready';
          // If reconnecting mid-exam, resume from last AI message; otherwise start fresh
          const kickoff = this._reconnectContext
            ? this._reconnectContext
            : '試験を開始してください。最初の質問をしてください。';
          this._reconnectContext = null;
          this.liveWs.send(JSON.stringify({
            client_content: {
              turns: [{ role: 'user', parts: [{ text: kickoff }] }],
              turn_complete: true
            }
          }));
          await this._startMicCapture();
          return;
        }

        if (data.serverContent) {
          const sc = data.serverContent;

          // Model turn: audio chunks (AUDIO modality → audio only, no text in parts)
          if (sc.modelTurn && sc.modelTurn.parts) {
            let hasAudio = false;
            for (const part of sc.modelTurn.parts) {
              if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                this.voiceAudioQueue.push(part.inlineData.data);
                hasAudio = true;
              }
              // Text parts (fallback — in AUDIO mode text comes via outputTranscription instead)
              if (part.text) this.voiceCurrentAiText += part.text;
            }
            if (hasAudio) {
              this.liveStatus = 'ai_speaking';
              if (!this.voiceIsPlaying) this._playNextAudioChunk();
            }
          }

          // AI output transcription — primary source for AI text in AUDIO mode
          if (sc.outputTranscription && sc.outputTranscription.text) {
            this.voiceCurrentAiText += sc.outputTranscription.text;
          }

          // User speech transcription — accumulate, push only when explicitly finished
          if (sc.inputTranscription) {
            if (sc.inputTranscription.text) {
              this._pendingUserText = (this._pendingUserText || '') + sc.inputTranscription.text;
            }
            // Only push when API signals the transcription is complete
            if (sc.inputTranscription.finished === true && this._pendingUserText && this._pendingUserText.trim()) {
              this.messages.push({ role: 'user', content: this._pendingUserText.trim() });
              this._pendingUserText = '';
            }
          }

          // AI turn complete
          if (sc.turnComplete) {
            // Flush any remaining user speech that wasn't finalized yet
            if (this._pendingUserText && this._pendingUserText.trim()) {
              this.messages.push({ role: 'user', content: this._pendingUserText.trim() });
              this._pendingUserText = '';
            }
            const aiText = this._cleanAiText(this.voiceCurrentAiText.trim());
            if (aiText) {
              this.messages.push({ role: 'assistant', content: aiText });
              if (aiText.includes('以上で試問を終了します')) {
                this.voiceCurrentAiText = '';
                setTimeout(() => this.endExam(), 1500);
                return;
              }
            }
            this.voiceCurrentAiText = '';
            if (this.voiceAudioQueue.length === 0 && !this.voiceIsPlaying) {
              this.liveStatus = 'listening';
            }
          }

          // Interrupted (user spoke over AI)
          if (sc.interrupted) {
            this.voiceAudioQueue = [];
            this.voiceCurrentAiText = '';
            this._pendingUserText = '';
            this.voiceIsPlaying = false;
            this.liveStatus = 'listening';
          }
        }

        if (data.error) {
          const msg = data.error.message || JSON.stringify(data.error);
          console.error('Live API error:', msg);
          this.liveStatus = 'error';
          this.liveErrorMsg = msg;
        }
      };

      this.liveWs.onerror = (e) => {
        console.error('LiveWS error:', e);
        this.liveStatus = 'error';
        this.liveErrorMsg = '接続エラーが発生しました';
      };
      this.liveWs.onclose = (e) => {
        console.log('LiveWS closed:', e.code, e.reason);
        if (e.code !== 1000 && e.code !== 1001) {
          // Abnormal close — show error with reason
          this.liveErrorMsg = e.reason ? `[${e.code}] ${e.reason}` : `接続が切断されました（コード: ${e.code}）`;
          this.liveStatus = 'error';
        } else if (this.liveStatus !== 'error') {
          this.liveStatus = 'idle';
          this.liveErrorMsg = '';
        }
      };
    },

    // ---- Start microphone capture and stream to WebSocket ----
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
      // ファイルサイズ制限なし

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
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `APIエラー (${res.status})`);
        }
        const data = await res.json();
        let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        raw = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, m => m.replace(/```json|```/g, '')).trim();
        // JSONブロックだけ抽出（前後の余分なテキストを除去）
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AIからのJSON応答が見つかりませんでした。モデルを変更して再試行してください。');
        const parsed = JSON.parse(jsonMatch[0]);

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
    async openGooglePicker() {
      if (!this.googlePickerApiKey || !this.googlePickerClientId) {
        alert('Google Picker APIの設定（APIキー・クライアントID）が完了していません。システム設定画面で設定してください。');
        return;
      }

      // 1. Authenticate with Google Identity Services (GIS)
      if (!this._gisToken) {
        try {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: this.googlePickerClientId,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            callback: (response) => {
              if (response.error) {
                alert('認証に失敗しました: ' + response.error);
                return;
              }
              this._gisToken = response.access_token;
              this.createPicker();
            },
          });
          client.requestAccessToken();
        } catch (e) {
          alert('Google APIの初期化に失敗しました。ライブラリの読み込みを待ってから再度お試しください。');
        }
      } else {
        this.createPicker();
      }
    },

    createPicker() {
      if (!this._pickerApiLoaded) {
        gapi.load('picker', {
          callback: () => {
            this._pickerApiLoaded = true;
            this.showPicker();
          }
        });
      } else {
        this.showPicker();
      }
    },

    showPicker() {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
      view.setMimeTypes('application/pdf,text/plain,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,text/csv');
      
      const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setAppId(this.googlePickerClientId)
        .setOAuthToken(this._gisToken)
        .addView(view)
        .setDeveloperKey(this.googlePickerApiKey)
        .setCallback(this.handlePickerAction.bind(this))
        .build();
      picker.setVisible(true);
    },

    async handlePickerAction(data) {
      if (data.action === google.picker.Action.PICKED) {
        const file = data.docs[0];
        const fileId = file.id;
        const name = file.name;
        const mimeType = file.mimeType;
        
        this.settings.documentName = `[Drive] ${name}`;
        this.settings.documentUrl = file.url || `https://drive.google.com/file/d/${fileId}/view`;
        await this.loadGoogleDriveFileContent(fileId, mimeType);
      }
    },

    async loadGoogleDriveFileContent(fileId, mimeType) {
      this.isGeneratingFromDoc = true;
      try {
        let text = '';
        const token = this._gisToken;

        if (mimeType === 'application/pdf') {
          // For PDF from Drive: fetch blob and use Gemini text extraction
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const blob = await res.blob();
          
          // Convert blob to base64
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });

          // Use Gemini to extract text (consistent with local upload)
          const endpoint = `${GEMINI_BASE}${this.selectedModel}:generateContent?key=${this.apiKey}`;
          const gRes = await fetch(endpoint, {
            method: 'POST',
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
          const gData = await gRes.json();
          text = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (mimeType.includes('google-apps')) {
          // Export Google Docs/Sheets
          const exportMimeType = mimeType.includes('spreadsheet') ? 'text/csv' : 'text/plain';
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${exportMimeType}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          text = await res.text();
        } else {
          // Direct download (Text/CSV)
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          text = await res.text();
        }

        this.settings.documentText = text.slice(0, 50000);
        alert('✅ Google Driveから資料を読み込みました。');
      } catch (e) {
        console.error('Picker content error:', e);
        alert('ファイルの読み込みに失敗しました。共有設定やAPI構成を確認してください。');
      } finally {
        this.isGeneratingFromDoc = false;
      }
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
          status: t.status || 'draft',
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

      // Try scoring model first; fallback to selectedModel (conversation model) on quota error
      const scoringModels = [...new Set([
        this.selectedModel, // primary (conversation model)
      ])];

      let lastError = null;
      let scored = false;

      for (const model of scoringModels) {
        try {
          const endpoint = `${GEMINI_BASE}${model}:generateContent?key=${this.apiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3 }
            })
          });

          if (!res.ok) {
            const errData = await res.json();
            const errMsg = errData.error?.message || '';
            if (res.status === 429 || errMsg.includes('quota') || errMsg.includes('limit: 0')) {
              lastError = new Error(errMsg || 'quota exceeded');
              continue; // try next model
            }
            throw new Error(errMsg || 'API Error ' + res.status);
          }

          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            this.result = JSON.parse(jsonMatch[0]);
            if (model !== this.selectedModel) {
              console.info(`[採点] クォータ超過のためフォールバックモデル使用: ${model}`);
            }
            this.saveResult();
            this.clearExamProgress();
            this.page = 'result';
            scored = true;
            break;
          } else {
            throw new Error('採点結果の解析に失敗しました');
          }
        } catch(modelErr) {
          const m = modelErr.message || '';
          if (m.includes('quota') || m.includes('429') || m.includes('limit: 0')) {
            lastError = modelErr;
            continue;
          }
          alert('採点に失敗しました: ' + m);
          this.isScoring = false;
          return;
        }
      }

      if (!scored) {
        alert(`⚠️ すべてのモデルでAPIクォータが超過しました。\n時間をおいてから再試行してください。\n（会話ログは「中断して保存」で保存できます）\nエラー: ${lastError?.message || '不明'}`);
      }
      this.isScoring = false;
    },

    saveExamProgress() {
      if (!this.examStarted || this.messages.length === 0) return;
      const name = this.studentUser ? this.studentUser.name : this.studentName;
      const email = this.studentUser ? this.studentUser.email : this.studentEmail;
      const classId = this.studentClassId || '';
      const progressId = this._examProgressId || ('prog_' + Date.now());
      this._examProgressId = progressId;
      const row = {
        id: progressId,
        date: new Date().toISOString(),
        theme: this.settings.theme || '',
        student_name: name || '（未入力）',
        student_email: email || '',
        class_id: classId || null,
        test_id: this.activeTestId || null,
        status: 'in_progress',
        published: false,
        total_score: null,
        criteria: null,
        question_scores: null,
        overall_comment: null,
        improvements: null,
        ai_score: null,
        admin_score: null,
        focus_violation_count: this.focusViolationCount,
        focus_violation_flagged: this.focusViolationFlagged,
        focus_violations: this.focusViolations,
        conversation_log: JSON.parse(JSON.stringify(this.messages)),
      };
      // Store settings in conversation_log as metadata for restore
      row._settings_snapshot = JSON.parse(JSON.stringify(this.settings));
      if (typeof _supabase !== 'undefined' && _supabase) {
        _supabase.from('exam_results').upsert(row).then(() => {
          this.examProgressSaved = true;
          setTimeout(() => { this.examProgressSaved = false; }, 2000);
        });
      }
    },

    async restoreExamProgress(progressId) {
      if (!progressId || !_supabase) return false;
      try {
        const { data } = await _supabase.from('exam_results')
          .select('*').eq('id', progressId).eq('status', 'in_progress').single();
        if (!data) return false;
        this.messages = data.conversation_log || [];
        this._examProgressId = progressId;
        this.activeTestId = data.test_id || this.activeTestId;
        this.studentClassId = data.class_id || this.studentClassId;
        if (data._settings_snapshot) this.settings = data._settings_snapshot;
        this.examStarted = true;
        this.examRestoredAt = data.date;
        this.page = 'exam';
        await this.$nextTick();
        this.initQuill();
        return true;
      } catch(e) { return false; }
    },

    async clearExamProgress() {
      if (this._examProgressId && _supabase) {
        await _supabase.from('exam_results').delete().eq('id', this._examProgressId);
        this._examProgressId = null;
      }
      this.examRestoredAt = null;
    },

    async hasSavedProgress() {
      if (!_supabase) return null;
      const name = this.studentUser ? this.studentUser.name : this.studentName;
      const email = this.studentUser ? this.studentUser.email : this.studentEmail;
      const { data } = await _supabase.from('exam_results')
        .select('id, date, theme')
        .eq('status', 'in_progress')
        .eq('student_email', email || '')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data || null;
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
  };
}