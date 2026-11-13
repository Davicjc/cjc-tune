# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-11-13

Primeira versão do CJC Tune, um app próprio que nasceu do FXSound for Linux 1.2.0 (Raul909, MIT).

### Novo
- **Reiniciar serviço de áudio**, no menu da bandeja e na tela Saída. Recria o dispositivo virtual e zera os filtros sem fechar o app: resolve som estalando, travado ou sumido. `pkill -USR1 cjc-tune` faz o mesmo (dá para pôr num atalho de teclado).
- **Interface nova no estilo macOS**: barra lateral com Equalizador, Efeitos, Saída e Ajustes; barra de título própria com os três botões; tema claro, escuro ou automático; 8 cores de destaque.
- **Equalizador em gráfico**: a curva desenhada é a resposta real dos 10 filtros (mesma fórmula, mesmo Q, mesma taxa do processador), com um ponto por banda para arrastar e o espectro ao vivo por trás. Os controles verticais continuam embaixo para ajuste fino e pelo teclado.
- **Tela Saída**: lista de dispositivos com "Automático", qual está em uso, estado do serviço.
- Na primeira vez que abre, **traz a configuração do FXSound for Linux** (EQ, efeitos, saída), se existir. Importa também arquivos exportados por ele.

### Corrigido
- **Fechar o app podia apagar os ajustes salvos** (bug herdado). Ao sair, a gravação final e a thread de gravação escreviam no mesmo arquivo temporário ao mesmo tempo, e o arquivo publicado podia sair vazio ou pela metade. Agora a gravação final espera a thread terminar.

### Mudou
- Código reorganizado: o processamento virou o módulo `dsp/` (filtros, reverb, dinâmica e cadeia em arquivos separados), o roteamento virou `routing`, e a inicialização foi dividida em `commands`, `tray` e `state`.
- Nome, ícone, identificador (`com.davicjc.cjctune`), dispositivo de áudio (`cjc_tune_sink`) e pasta de configuração próprios.
- Fonte Inter embutida; nada é baixado da internet.

### Herdado do FXSound for Linux 1.2.0
EQ de 10 bandas, efeitos (fidelidade, ambiente, reforço dinâmico, surround 3D, HyperBass), presets, roteamento por dispositivo virtual sem eco, bandeja, iniciar com o sistema, exportar/importar, desenho por GPU com proteção, 4 idiomas.
