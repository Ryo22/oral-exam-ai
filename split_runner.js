const fs = require('fs');

const code = fs.readFileSync('js/main.js', 'utf8');

// The logic is return { ... }
// We want to detect methods based on top-level indent (4 spaces).
// We'll read line by line.

const lines = code.split('\n');

const auth_methods = ['handleSessionStart', 'adminLogout', 'submitAuth', 'logoutSystem', 'loginWithGoogle'];
const admin_methods = ['filteredResults', 'availableTestsForStudent', 'selectTestForStudent', 'saveApiKey', 'adminLogin', 'changeAdminPassword', 'addClass', 'saveClassesToStorage', 'startEditClass', 'saveClassName', 'cancelEditClass', 'removeClass', 'getClassUrl', 'copyClassUrl', 'getTestUrl', 'copyTestUrl', 'copyTestClassUrl', 'toggleTestClass', 'saveTestsToStorage', 'switchTest', 'addTest', 'deleteTest', 'startEditTest', 'saveTestName', 'cancelEditTest', 'togglePublish', 'startEditResult', 'saveEditResult', 'cancelEditResult', 'resetToAiScore', 'getDisplayScore', 'findPastResults', 'saveResults', 'loadFromSupabase', 'saveAppSetting', 'saveResult', 'downloadSingleResult', 'exportAllResults', 'exportConversationLogs', 'signOutStudent', 'fetchModels', 'addCriterion', 'removeCriterion', 'addQuestion', 'removeQuestion', 'importQuestionsFile', 'exportQuestionsCSV', 'handleDocumentUpload', 'generateFromDocument', 'saveSettings'];
const exam_methods = ['startMypageChat', 'sendMypageChatMessage', 'startExamPage', 'switchVoiceMode', 'startExam', 'initQuill', 'getQuillText', 'getQuillHtml', 'clearQuill', 'handleSend', 'endExam', 'confirmEndExam', 'retryExam', 'buildSystemPrompt', 'callGemini', 'setupFocusMonitoring', 'teardownFocusMonitoring', 'recordFocusViolation', 'scrollToBottom'];
const voice_methods = ['initLiveSession', '_startMicCapture', '_playNextAudioChunk', '_timeStretch', 'reconnectLiveSession', 'parseMarkdown', '_hasJapanese', '_cleanAiText', '_cleanAiTextRealtime', 'stopLiveSession'];

let currentState = 'scanning';
let currentMethod = null;
let currentBlock = [];
let braceCount = 0;

let authBlocks = [];
let adminBlocks = [];
let examBlocks = [];
let voiceBlocks = [];

let newMainLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (currentState === 'scanning') {
        const methodMatch = line.match(/^    (?:async )?(?:get )?([a-zA-Z_$][0-9a-zA-Z_$]*)\s*\([^)]*\)\s*\{/);
        if (methodMatch) {
            const mName = methodMatch[1];
            if (mName === 'init') {
                newMainLines.push(line);
                continue;
            }
            // Start capturing a method block
            currentMethod = mName;
            currentState = 'capturing';
            currentBlock = [line];
            braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        } else {
            newMainLines.push(line);
        }
    } else if (currentState === 'capturing') {
        currentBlock.push(line);
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        if (braceCount === 0) {
            // Block finished
            // Check if there is a trailing comma on exactly this line or the next?
            if (line.endsWith(',')) {
                currentBlock[currentBlock.length - 1] = line.slice(0, -1);
            }
            // Sometimes trailing comma is on the next line or at the end
            if (i + 1 < lines.length && lines[i+1].trim() === ',') {
                i++; // skip next line
            }
            
            const blockStr = currentBlock.join('\n');
            if (auth_methods.includes(currentMethod)) authBlocks.push(blockStr);
            else if (admin_methods.includes(currentMethod)) adminBlocks.push(blockStr);
            else if (exam_methods.includes(currentMethod)) examBlocks.push(blockStr);
            else if (voice_methods.includes(currentMethod)) voiceBlocks.push(blockStr);
            else newMainLines.push(currentBlock.join('\n') + ','); // put it back
            
            currentState = 'scanning';
        }
    }
}

// Generate files
fs.writeFileSync('js/auth.js', `window.appAuth = function() {\n  return {\n${authBlocks.join(',\n\n')}\n  };\n};\n`);
fs.writeFileSync('js/admin.js', `window.appAdmin = function() {\n  return {\n${adminBlocks.join(',\n\n')}\n  };\n};\n`);
fs.writeFileSync('js/exam.js', `window.appExam = function() {\n  return {\n${examBlocks.join(',\n\n')}\n  };\n};\n`);
fs.writeFileSync('js/voice.js', `window.appVoice = function() {\n  return {\n${voiceBlocks.join(',\n\n')}\n  };\n};\n`);

// Now state extraction: State is everything inside "return {" and the first method definition or init().
let mainStr = newMainLines.join('\n');
const stateMatch = mainStr.match(/return\s*\{([\s\S]*?)(\n    (?:async )?(?:get )?[a-zA-Z_$][0-9a-zA-Z_$]*\s*\()/);
if (stateMatch) {
    let stateStr = stateMatch[1].trim();
    if (stateStr.endsWith(',')) stateStr = stateStr.slice(0, -1);
    fs.writeFileSync('js/state.js', `window.appState = function() {\n  return {\n${stateStr}\n  };\n};\n`);
    
    // Replace state in mainStr
    mainStr = mainStr.replace(stateMatch[1], `\n    ...window.appState(),\n    ...window.appAuth(),\n    ...window.appAdmin(),\n    ...window.appExam(),\n    ...window.appVoice(),\n\n`);
}

fs.writeFileSync('js/main.js', mainStr);
console.log('JS files split successfully.');
