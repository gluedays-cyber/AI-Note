package assets

import (
	_ "embed"
)

//go:embed index.html
var IndexHTML []byte

//go:embed base.css
var BaseCSS []byte

//go:embed tabs.css
var TabsCSS []byte

//go:embed editor.css
var EditorCSS []byte

//go:embed ai.css
var AiCSS []byte

//go:embed tabs.js
var TabsJS []byte

//go:embed editor.js
var EditorJS []byte

//go:embed ai-config.js
var AiConfigJS []byte

//go:embed ai-chat.js
var AiChatJS []byte

//go:embed suggestion.js
var SuggestionJS []byte

//go:embed NotoSansKR-Regular.woff2
var NotoSansKRRegularWOFF2 []byte

//go:embed NotoSerifKR-VF.ttf
var NotoSerifKR []byte

//go:embed NotoSerifSC-VariableFont_wght.ttf
var NotoSerifSC []byte

