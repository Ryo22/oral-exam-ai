window.appAuth = function() {
  return {
    async handleSessionStart(user) {
      this.currentUser = user;
      this.studentUser = { name: user.user_metadata?.name || user.email.split('@')[0], email: user.email };
      this.studentName = this.studentUser.name;
      this.studentEmail = this.studentUser.email;
      this.studentNameConfirmed = true;

      if (user.email === 'ryo.ishigami.1129@gmail.com' || user.email === 'ryo.ishigami.1129+test@gmail.com') {
        this.userRole = 'admin';
      } else {
        // Fetch role
        const { data: roleData } = await _supabase.from('user_roles').select('role').eq('user_id', user.id).single();
        if (roleData) {
          this.userRole = roleData.role;
        } else {
          this.userRole = 'student'; // Default fallback
        }
      }
      
      this.page = (this.userRole === 'admin' || this.userRole === 'teacher') ? 'admin' : 'student';
      this.authLoading = false;
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
    },

    async loginWithGoogle() {
      if (typeof _supabase === 'undefined' || !_supabase) return alert('Supabaseが設定されていません。');
      if (!this.googleClientId) return alert('管理者設定からGoogle Client IDを設定してください。');
      google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: async (response) => {
          try {
            const { error } = await _supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
            });
            if (error) throw error;
          } catch (err) {
            alert(err.message || 'Googleログインに失敗しました');
          }
        }
      });
      google.accounts.id.prompt();
    },

    async adminLogout() {
      await this.logoutSystem();
    }
  };
};
