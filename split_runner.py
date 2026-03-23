import re

def balanced_braces(s):
    count = 0
    in_str = None
    escape = False
    for i, c in enumerate(s):
        if escape:
            escape = False
            continue
        if c == '\\':
            escape = True
            continue
        if in_str:
            if c == in_str:
                in_str = None
            continue
        if c in ['"', "'", '`']:
            in_str = c
            continue
            
        if c == '{':
            count += 1
        elif c == '}':
            count -= 1
            if count == 0:
                return i
    return -1

def extract_methods(content, methods):
    extracted = []
    # Strip comments temporarily for reliable matching? NO, keep them.
    for method in methods:
        pattern = re.compile(r'\n    (?:async\s+)?(?:get\s+)?' + re.escape(method) + r'\s*\([^)]*\)\s*\{', re.MULTILINE)
        match = pattern.search(content)
        if match:
            start_idx = match.start() + 1 # +1 for \n
            brace_start = match.end() - 1
            remainder = content[brace_start:]
            end_offset = balanced_braces(remainder)
            if end_offset != -1:
                end_idx = brace_start + end_offset + 1
                block = content[start_idx:end_idx]
                extracted.append(block)
    return extracted

def main():
    with open('js/main.js', 'r', encoding='utf-8') as f:
        src = f.read()

    auth_methods = [
        'handleSessionStart', 'submitAuth', 'logoutSystem', 'loginWithGoogle', 'adminLogout'
    ]
    
    admin_methods = [
        'filteredResults', 'availableTestsForStudent', 'selectTestForStudent', 'saveApiKey',
        'adminLogin', 'changeAdminPassword', 'addClass', 'saveClassesToStorage', 'startEditClass',
        'saveClassName', 'cancelEditClass', 'removeClass', 'getClassUrl', 'copyClassUrl',
        'getTestUrl', 'copyTestUrl', 'copyTestClassUrl', 'toggleTestClass', 'saveTestsToStorage',
        'switchTest', 'addTest', 'deleteTest', 'startEditTest', 'saveTestName', 'cancelEditTest',
        'togglePublish', 'startEditResult', 'saveEditResult', 'cancelEditResult', 'resetToAiScore',
        'getDisplayScore', 'findPastResults', 'saveResults', 'loadFromSupabase', 'saveAppSetting',
        'saveResult', 'downloadSingleResult', 'exportAllResults', 'exportConversationLogs',
        'signOutStudent', 'fetchModels', 'addCriterion', 'removeCriterion', 'addQuestion',
        'removeQuestion', 'importQuestionsFile', 'exportQuestionsCSV', 'handleDocumentUpload',
        'generateFromDocument', 'saveSettings'
    ]
    
    exam_methods = [
        'startMypageChat', 'sendMypageChatMessage', 'startExamPage', 'switchVoiceMode', 'startExam',
        'initQuill', 'getQuillText', 'getQuillHtml', 'clearQuill', 'handleSend', 'endExam',
        'confirmEndExam', 'retryExam', 'buildSystemPrompt', 'callGemini', 'setupFocusMonitoring',
        'teardownFocusMonitoring', 'recordFocusViolation', 'scrollToBottom'
    ]
    
    voice_methods = [
        'initLiveSession', '_startMicCapture', '_playNextAudioChunk', '_timeStretch',
        'reconnectLiveSession', 'parseMarkdown', '_hasJapanese', '_cleanAiText',
        '_cleanAiTextRealtime', 'stopLiveSession'
    ]

    objects = {
        'auth': extract_methods(src, auth_methods),
        'admin': extract_methods(src, admin_methods),
        'exam': extract_methods(src, exam_methods),
        'voice': extract_methods(src, voice_methods)
    }

    # Write each
    for name, blocks in objects.items():
        with open(f'js/{name}.js', 'w', encoding='utf-8') as f:
            f.write(f"window.app{name.capitalize()} = function() {{\n  return {{\n")
            f.write(",\n\n".join(blocks))
            f.write("\n  };\n};\n")

    # State extraction
    state_match = re.search(r'return\s*\{([\s\S]*?)\n    (?:get |async |init\(\))', src)
    if state_match:
        state_content = state_match.group(1).rstrip()
        if state_content.endswith(','): state_content = state_content[:-1]
        with open('js/state.js', 'w', encoding='utf-8') as f:
            f.write("window.appState = function() {\n  return {\n")
            f.write(state_content)
            f.write("\n  };\n};\n")

    # Now rewrite main.js 
    # Must remove all extracted methods and the state from main.js, leaving `init()` and anything else.
    content = src
    content = content.replace(state_match.group(1), "") # remove state content
    
    for method in auth_methods + admin_methods + exam_methods + voice_methods:
        pattern = re.compile(r'\n    (?:async\s+)?(?:get\s+)?' + re.escape(method) + r'\s*\([^)]*\)\s*\{', re.MULTILINE)
        match = pattern.search(content)
        if match:
            start_idx = match.start() + 1
            brace_start = match.end() - 1
            remainder = content[brace_start:]
            end_offset = balanced_braces(remainder)
            if end_offset != -1:
                end_idx = brace_start + end_offset + 1
                before = content[:start_idx]
                after = content[end_idx:]
                after = re.sub(r'^\s*,\s*', '', after, count=1, flags=re.MULTILINE)
                content = before + after

    # Inject the spread operators inside `return {`
    insert_str = "\n    ...window.appState(),\n    ...window.appAuth(),\n    ...window.appAdmin(),\n    ...window.appExam(),\n    ...window.appVoice(),\n"
    content = re.sub(r'return\s*\{\s*', 'return {' + insert_str, content)

    with open('js/main.js', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    main()
