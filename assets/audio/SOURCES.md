# 池塘环境音来源

这三份自然录音经过裁剪、去除直流偏移、柔和高低频滤波、音量调整，并转换为 22050 Hz、16 位 PCM WAV。水声与树叶风声平滑收低突出的瞬间峰值，并使用 0.65 秒交叠处理循环接缝；鸟鸣保留为短片段并淡入淡出。网页内嵌处理后的录音，播放时无需网络。

| 本地文件 | 原录音、作者 | 授权 | 本项目处理 |
|---|---|---|---|
| `pond-water.wav` | [Soft stream flowing water](https://commons.wikimedia.org/wiki/File:433589_jackthemurray_stream-river-water-up-close.wav)，jackthemurray | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 原录音 8–29 秒，95 Hz–3.2 kHz 柔和滤波，降低为安静池畔的水声底层 |
| `leaves-wind.wav` | [Leaves in the wind](https://commons.wikimedia.org/wiki/File:Leaves_in_the_wind_(Gravity_Sound).wav)，[Gravity Sound](https://www.gravitysound.studio/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 原录音 1–12 秒，180 Hz–5.5 kHz 柔和滤波、循环与音量调整；作为随四季变化的草木风声 |
| `garden-bird.wav` | [Phylloscopus and tailorbird calls, Thiruvannamalai](https://commons.wikimedia.org/wiki/File:20191014_102654_phylloscopus_thiru.ogg)，Shyamal | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 原录音 2–6.2 秒，850 Hz–7.6 kHz 柔和滤波，淡入淡出，随机间隔和轻微声像变化 |

上述授权适用于音频素材，独立于项目代码授权。复制发布时请保留本文件，特别是 Gravity Sound 的署名、来源、CC BY 4.0 链接及处理说明。

夏季的蝉声、夜间虫鸣与蛙声、雨声、雷声和互动水声仍由 Web Audio 合成。四季与晴雨、昼夜控制各层的强度、出现频率和淡入淡出；冬季不播放鸟鸣、虫鸣和蛙声。
