package api

import (
	"encoding/json"
	"fmt"

	"github.com/jchv/go-webview2"

	"note/pkg/ai"
	"note/pkg/config"
	"note/pkg/crypto"
	"note/pkg/dialogs"
	"note/pkg/handlers"
)

func SendChunk(wInstance webview2.WebView, thinking, response string, done bool) {
	outData, _ := json.Marshal(map[string]interface{}{
		"thinking": thinking,
		"response": response,
		"done":     done,
	})
	if wInstance != nil {
		wInstance.Dispatch(func() {
			wInstance.Eval(fmt.Sprintf("if(window.onAiChunk){window.onAiChunk(%s);}", string(outData)))
		})
	}
}

func RegisterAPIs(wInstance webview2.WebView) {
	wInstance.Bind("getInitData", func() map[string]string {
		return map[string]string{
			"targetFile": config.TargetFile,
		}
	})

	wInstance.Bind("apiLoad", func(path string) (handlers.DocData, error) {
		return handlers.ApiLoad(path, config.TargetFile)
	})

	wInstance.Bind("apiSave", handlers.ApiSave)
	wInstance.Bind("apiOpenDialog", dialogs.ApiOpenDialog)
	wInstance.Bind("apiSaveAsDialog", dialogs.ApiSaveAsDialog)
	wInstance.Bind("apiRename", dialogs.ApiRename)

	wInstance.Bind("apiAiChat", func(prompt, fullContent, selectedContent, model string) {
		ai.ApiAiChat(prompt, fullContent, selectedContent, model, crypto.Decrypt, func(thinking, response string, done bool) {
			SendChunk(wInstance, thinking, response, done)
		})
	})

	wInstance.Bind("apiGetAIConfig", func() (ai.AIConfig, error) {
		return ai.ApiGetAIConfig(crypto.Decrypt)
	})

	wInstance.Bind("apiSaveAIConfig", func(cfg ai.AIConfig) error {
		return ai.ApiSaveAIConfig(cfg, crypto.Encrypt)
	})
	wInstance.Bind("apiDeleteAIConfig", ai.ApiDeleteAIConfig)
	wInstance.Bind("apiGetOllamaModels", func() ([]string, error) {
		return ai.GetOllamaModels()
	})
}
