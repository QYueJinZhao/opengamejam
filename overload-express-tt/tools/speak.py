"""用 Windows SAPI 中文语音播报引导词。用法：
    python tools/speak.py "要念的中文"
    python tools/speak.py -f 引导词文件.txt
"""
import sys
import win32com.client

def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "-f":
        with open(sys.argv[2], encoding="utf-8") as f:
            text = f.read().strip()
    elif len(sys.argv) >= 2:
        text = " ".join(sys.argv[1:])
    else:
        text = sys.stdin.read().strip()

    if not text:
        print("没有可播报的内容")
        return

    sp = win32com.client.Dispatch("SAPI.SpVoice")
    voices = sp.GetVoices()
    for i in range(voices.Count):
        desc = voices.Item(i).GetDescription()
        if "Huihui" in desc or "Chinese" in desc:
            sp.Voice = voices.Item(i)
            break
    sp.Rate = -2      # 放慢，指令更清楚
    sp.Volume = 100
    print("播报中:", text)
    sp.Speak(text, 0)  # 0 = 同步，念完才返回

if __name__ == "__main__":
    main()
