// Guias: páginas de busca (SEO) com conteúdo útil de verdade. Cada guia vira
// uma página estática. Blocos: ["h2", texto] | ["p", texto] | ["ol", [itens]] |
// ["ul", [itens]] | ["code", texto]. `crase` vira <code>.

export const guiasPt = [
  {
    slug: "equalizador-ubuntu",
    titulo: "Equalizador para Ubuntu: como equalizar o som do sistema inteiro",
    h1: "Equalizador para Ubuntu",
    descricao:
      "Como instalar um equalizador no Ubuntu que vale para todo o som do sistema (Spotify, navegador, jogos). Passo a passo com o CJC Tune, grátis, para Ubuntu 22.04, 24.04 e mais novos.",
    resumo: "Instale um equalizador que vale para tudo o que toca no Ubuntu, em dois minutos.",
    blocos: [
      ["p", "O Ubuntu não vem com um equalizador para o som do sistema. As configurações de som deixam escolher a saída e o volume, mas não mexem no grave, nos médios e nos agudos. Para isso é preciso um programa que fique entre os aplicativos e o seu fone."],
      ["p", "O CJC Tune faz isso: ele cria uma saída de áudio chamada CJC Tune, coloca ela como padrão e processa tudo o que passa por ela com um equalizador de 10 bandas e efeitos. Funciona no Ubuntu 22.04, 24.04 e mais novos, com PipeWire (o padrão desde o 22.10) ou PulseAudio."],
      ["h2", "Instalar pelo .deb"],
      ["ol", [
        "Baixe o arquivo `cjc-tune_1.0.0_amd64.deb` na página de instalação.",
        "Abra o terminal na pasta do download e rode `sudo apt install ./cjc-tune_1.0.0_amd64.deb`.",
        "Abra o CJC Tune pelo menu de aplicativos. O som do sistema passa a sair por ele na hora.",
      ]],
      ["h2", "Ou usar o AppImage"],
      ["p", "O AppImage roda sem instalar. No Ubuntu 22.04 e mais novos ele precisa da biblioteca FUSE 2, que não vem instalada por padrão:"],
      ["code", "sudo apt install libfuse2t64   # Ubuntu 24.04 ou mais novo\nsudo apt install libfuse2      # Ubuntu 22.04\nchmod +x cjc-tune_1.0.0_amd64.AppImage\n./cjc-tune_1.0.0_amd64.AppImage"],
      ["h2", "Ajustar o som"],
      ["ul", [
        "Escolha uma predefinição (Música, Filmes, Jogos, Grave reforçado) ou arraste os pontos da curva.",
        "Em Efeitos, o HyperBass encorpa o grave e a Fidelidade devolve brilho aos agudos.",
        "Gostou? Use Salvar… para guardar a sua curva com um nome.",
      ]],
      ["h2", "Se o som travar ou estalar"],
      ["p", "Clique com o botão direito no ícone do CJC Tune na bandeja e escolha Reiniciar serviço de áudio. Ele recria a saída e zera os filtros sem fechar nada. Fechar o app devolve o som para a saída normal do Ubuntu."],
    ],
  },
  {
    slug: "equalizador-linux-mint",
    titulo: "Equalizador para Linux Mint (Cinnamon, MATE e XFCE)",
    h1: "Equalizador para Linux Mint",
    descricao:
      "Equalizador para o Linux Mint que vale para todo o som: instale o CJC Tune pelo .deb, ajuste grave e agudos e deixe na bandeja. Funciona no Mint 21 e 22, Cinnamon, MATE e XFCE.",
    resumo: "O Mint não tem equalizador de sistema. Veja como colocar um em poucos cliques.",
    blocos: [
      ["p", "No Linux Mint, o applet de som controla volume e saída, mas não tem equalizador. O CJC Tune resolve isso para o sistema inteiro: navegador, Spotify, jogos e chamadas passam por ele antes de chegar ao fone ou à caixa de som."],
      ["p", "Ele foi feito e é usado no Linux Mint 22 com Cinnamon, e funciona também no MATE e no XFCE. O Mint 22 usa PipeWire e o Mint 21 usa PulseAudio; o CJC Tune funciona com os dois."],
      ["h2", "Instalar"],
      ["ol", [
        "Baixe o `cjc-tune_1.0.0_amd64.deb`.",
        "Dê dois cliques no arquivo e confirme no instalador de pacotes, ou rode `sudo apt install ./cjc-tune_1.0.0_amd64.deb` no terminal.",
        "Abra o CJC Tune pelo menu. O ícone fica na bandeja do painel.",
      ]],
      ["h2", "Deixar abrindo junto com o sistema"],
      ["p", "Em Ajustes, ligue Abrir ao iniciar a sessão e, se quiser, Iniciar escondido na bandeja. Assim o seu equalizador está sempre valendo, sem janela aberta."],
      ["h2", "Dicas para o Mint"],
      ["ul", [
        "Se você trocar de fone pelo applet de som, o CJC Tune vai junto para o aparelho novo.",
        "Deixe o volume do sistema em até 100%. Passar disso distorce antes do equalizador.",
        "Se o som sumir depois de suspender o PC, use Reiniciar serviço de áudio no ícone da bandeja.",
      ]],
    ],
  },
  {
    slug: "equalizador-pipewire",
    titulo: "Equalizador para PipeWire e PulseAudio: como funciona e qual usar",
    h1: "Equalizador para PipeWire e PulseAudio",
    descricao:
      "Como funciona um equalizador de sistema no PipeWire e no PulseAudio, a diferença entre o CJC Tune e o EasyEffects, e como instalar. Guia direto para Linux.",
    resumo: "O que acontece por baixo e como escolher entre o CJC Tune e o EasyEffects.",
    blocos: [
      ["p", "O PipeWire é o servidor de som da maioria das distribuições atuais (Ubuntu, Fedora, Linux Mint 22, Debian 12 com GNOME). Ele aceita programas feitos para o PulseAudio por meio do pipewire-pulse, então um equalizador pode falar com os dois do mesmo jeito."],
      ["h2", "Como um equalizador de sistema funciona"],
      ["p", "O CJC Tune cria um dispositivo virtual (uma saída chamada CJC Tune) e coloca ele como padrão. Os programas tocam nele sem saber de nada. O CJC Tune lê esse som, aplica os 10 filtros e os efeitos, e toca o resultado no seu fone de verdade."],
      ["code", "programas → saída CJC Tune → equalizador e efeitos → fone ou caixa"],
      ["p", "Os dois fluxos são abertos de um jeito que o servidor não consegue redirecionar o som de volta para a saída virtual. Isso evita o eco e o som dobrado que aparecem quando um equalizador grava a própria saída."],
      ["h2", "CJC Tune ou EasyEffects?"],
      ["p", "O EasyEffects é o mais completo: dezenas de plugins, compressores, filtros por aplicativo e muito controle. Em troca, tem muita opção para quem só quer o som melhor."],
      ["p", "O CJC Tune é o caminho curto: um equalizador de 10 bandas com a curva desenhada, cinco efeitos, predefinições com nome, bandeja e um botão para reiniciar o serviço quando o som trava. Se você quer ajustar o grave e esquecer, ele resolve."],
      ["h2", "Instalar"],
      ["ol", [
        "Baixe o AppImage (qualquer distribuição) ou o .deb (Debian, Ubuntu, Mint).",
        "Abra o CJC Tune. Ele detecta se o sistema usa PipeWire ou PulseAudio sozinho.",
        "Escolha uma predefinição ou desenhe a sua curva.",
      ]],
    ],
  },
  {
    slug: "alternativa-fxsound-linux",
    titulo: "FxSound no Linux: a alternativa que funciona",
    h1: "Alternativa ao FxSound no Linux",
    descricao:
      "O FxSound não tem versão para Linux. O CJC Tune traz o mesmo tipo de efeito (fidelidade, ambiente, reforço dinâmico, surround 3D e grave) para o som inteiro do Linux, grátis.",
    resumo: "O FxSound é só para Windows. Veja como ter os mesmos efeitos no Linux.",
    blocos: [
      ["p", "Quem vem do Windows sente falta do FxSound: um programa simples que deixa o som mais cheio sem pedir conhecimento técnico. Ele não tem versão oficial para Linux."],
      ["p", "O CJC Tune nasceu do FXSound for Linux, um projeto comunitário de código aberto, e ganhou interface, organização e recursos próprios. Ele traz o mesmo tipo de ajuste para o som do sistema inteiro: um equalizador de 10 bandas e cinco efeitos."],
      ["h2", "Os efeitos"],
      ["ul", [
        "Fidelidade: devolve detalhe e brilho aos agudos.",
        "Ambiente: uma reverberação de sala em volta do som.",
        "Reforço dinâmico: iguala o volume e traz as partes baixas para frente.",
        "Surround 3D: abre o estéreo.",
        "HyperBass: grave mais encorpado e com mais cauda.",
      ]],
      ["h2", "O que o CJC Tune tem a mais"],
      ["ul", [
        "A curva do equalizador desenhada, com pontos para arrastar.",
        "Predefinições com o nome que você escolher.",
        "Reiniciar serviço de áudio na bandeja, para quando o som travar.",
        "Atualização pelo próprio app.",
      ]],
      ["h2", "Já usava o FXSound for Linux?"],
      ["p", "Feche ele antes de abrir o CJC Tune. Na primeira vez, o CJC Tune traz o seu EQ, os efeitos e a saída escolhida, e também importa os arquivos exportados por ele."],
      ["p", "O CJC Tune não tem ligação com o FxSound do Windows. Os nomes dos efeitos são usados só para você reconhecer o que cada um faz."],
    ],
  },
  {
    slug: "aumentar-grave-fone-linux",
    titulo: "Como aumentar o grave do fone no Linux (sem distorcer)",
    h1: "Como aumentar o grave do fone no Linux",
    descricao:
      "Passo a passo para deixar o grave mais forte no Linux sem estourar o som: equalizador nas bandas certas, HyperBass e volume. Funciona em fone, headset e caixa de som.",
    resumo: "Quais bandas subir, quanto, e como evitar que o som estoure.",
    blocos: [
      ["p", "Grave forte não é só subir tudo. O grave mora nas bandas de 32, 64 e 125 Hz; subir demais as médias (250 a 500 Hz) deixa o som abafado, e passar do volume máximo do sistema distorce antes de qualquer equalizador."],
      ["h2", "Passo a passo com o CJC Tune"],
      ["ol", [
        "Instale e abra o CJC Tune.",
        "Escolha a predefinição Grave profundo, ou suba 32 Hz, 64 Hz e 125 Hz entre +4 e +8 dB.",
        "Baixe um pouco 250 e 500 Hz (−1 a −3 dB) para o grave não embolar com a voz.",
        "Em Efeitos, suba o HyperBass. Ele encorpa o grave e dá mais cauda à batida.",
        "Deixe o volume do sistema em até 100% e ajuste o volume no próprio fone ou no app.",
      ]],
      ["h2", "Por que não estoura"],
      ["p", "O CJC Tune tem um limitador no fim da cadeia: quando o grave forte passaria do máximo, ele segura o pico em vez de deixar o som rachar. E os filtros mudam suavemente, sem estalo quando você arrasta a curva."],
      ["h2", "Salve o seu"],
      ["p", "Achou o ponto certo? Use Salvar… e dê um nome, como Grave para filmes. O Personalizado também fica guardado quando você testa outra predefinição."],
    ],
  },
];

export const guiasEn = [
  {
    slug: "linux-system-wide-equalizer",
    titulo: "System-wide equalizer for Linux: how to EQ every app at once",
    h1: "System-wide equalizer for Linux",
    descricao:
      "How to equalize all sound on Linux (Spotify, browser, games, calls) with one app. Install CJC Tune on Ubuntu, Mint, Fedora or any distro with PipeWire or PulseAudio.",
    resumo: "One equalizer for everything your Linux PC plays, set up in two minutes.",
    blocos: [
      ["p", "Most Linux desktops let you pick an output and a volume, but none ships a system-wide equalizer. To change bass, mids and treble for every app you need something that sits between the apps and your headphones."],
      ["p", "CJC Tune does exactly that. It adds an output called CJC Tune, makes it the default, and runs everything through a 10-band equalizer and five effects. It works with PipeWire and PulseAudio."],
      ["h2", "Install"],
      ["ol", [
        "Download the AppImage (any distribution) or the .deb (Debian, Ubuntu, Mint).",
        "For the .deb: `sudo apt install ./cjc-tune_1.0.0_amd64.deb`. For the AppImage: `chmod +x` and run it.",
        "Open CJC Tune. System sound goes through it right away.",
      ]],
      ["h2", "Tune it"],
      ["ul", [
        "Pick a preset (Music, Movies, Gaming, Bass Boost) or drag the points on the curve.",
        "HyperBass makes the low end fuller; Fidelity brings back detail in the highs.",
        "Save your curve under a name with Save….",
      ]],
      ["p", "If sound ever crackles or disappears, right-click the tray icon and choose Restart audio service."],
    ],
  },
  {
    slug: "pipewire-equalizer",
    titulo: "PipeWire equalizer: how it works and which one to use",
    h1: "PipeWire equalizer",
    descricao:
      "How a system-wide equalizer works on PipeWire and PulseAudio, CJC Tune versus EasyEffects, and how to install it. A straight guide for Linux.",
    resumo: "What happens under the hood, and how to choose between CJC Tune and EasyEffects.",
    blocos: [
      ["p", "PipeWire is the sound server on most current distributions. Through pipewire-pulse it also accepts apps written for PulseAudio, so an equalizer can talk to both the same way."],
      ["h2", "How it works"],
      ["p", "CJC Tune creates a virtual output and makes it the default. Apps play into it; CJC Tune reads that sound, applies the ten filters and the effects, and plays the result on your real device. Both streams are opened so the server cannot route the sound back into the virtual output, which is what causes echo and doubled sound."],
      ["code", "apps → CJC Tune output → equalizer and effects → headphones or speakers"],
      ["h2", "CJC Tune or EasyEffects?"],
      ["p", "EasyEffects is the most complete option: dozens of plugins, per-app chains and a lot of control. CJC Tune is the short path: a drawn 10-band curve, five effects, named presets, a tray icon and a restart button for when sound gets stuck."],
    ],
  },
  {
    slug: "fxsound-for-linux-alternative",
    titulo: "FxSound for Linux: the alternative that works",
    h1: "An FxSound alternative for Linux",
    descricao:
      "FxSound has no Linux version. CJC Tune brings the same kind of effects (fidelity, ambience, dynamic boost, 3D surround and bass) to all of Linux's sound, for free.",
    resumo: "FxSound is Windows only. Here is how to get the same effects on Linux.",
    blocos: [
      ["p", "FxSound is a simple Windows app that makes sound fuller without technical knowledge. It has no official Linux version."],
      ["p", "CJC Tune grew out of FXSound for Linux, a community open-source project, and has its own interface, code layout and features. It applies a 10-band equalizer and five effects to the whole system: Fidelity, Ambience, Dynamic boost, 3D surround and HyperBass."],
      ["h2", "Coming from FXSound for Linux?"],
      ["p", "Quit it before opening CJC Tune. On its first launch CJC Tune brings over your EQ, effects and output, and it imports files exported by it."],
      ["p", "CJC Tune is not affiliated with FxSound for Windows. Effect names are used only so you can recognise what each one does."],
    ],
  },
];
