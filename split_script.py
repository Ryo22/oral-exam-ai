import json
import re

def split_js():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'<script>\s*// Configure marked once globally.*?</script>', content, re.DOTALL)
    if not match:
        print("Could not find script block")
        return
    
    script_content = match.group(0)
    
    # We will output the basic app.js for now. The user requested splitting by feature,
    # but the logic inside the returned object is highly entangled. 
    # Let's extract the whole script body into js/main.js first, then we can split it.
    
    inner_js = script_content.replace('<script>', '').replace('</script>', '').strip()
    
    with open('js/main.js', 'w', encoding='utf-8') as f:
        f.write(inner_js)
        
    new_html = content[:match.start()] + '<script src="js/main.js"></script>\n' + content[match.end():]
    
    # Also apply the UI patches:
    # 1. "テスト・クラス管理" -> "クラス・テスト管理"
    new_html = new_html.replace('テスト・クラス管理', 'クラス・テスト管理')
    
    # 2. "テスト管理" + 追加 button replace
    # we need to find the addTest() button and replace it with a button that says テスト問題を設定
    # Wait, the user said "remove the Add button and put the Test Settings button there."
    # If the user removes the Add button, how do they add tests? Maybe they don't!
    # I will replace the '+ 追加' button calling addTest() with a button calling something else, or maybe they just meant to rename it. Let's physically rename and bind it to addTest or switchTest.
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
        
    print("JS extracted to js/main.js and HTML updated!")

split_js()
