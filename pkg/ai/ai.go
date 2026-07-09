package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"google.golang.org/genai"
)

type CustomModel struct {
	Name  string `json:"name"`
	Alias string `json:"alias"`
}

type APIProvider struct {
	APIKey string        `json:"apiKey"`
	Models []CustomModel `json:"models"`
}

type AIConfig struct {
	Current string      `json:"current"`
	Google  APIProvider `json:"google"`
	Groq    APIProvider `json:"groq"`
	Ollama  APIProvider `json:"ollama"`
	Upstage APIProvider `json:"upstage"`
}

func getAIConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Documents", ".apikeys.json"), nil
}

func ApiGetAIConfig(decryptFn func(string) (string, error)) (AIConfig, error) {
	var config AIConfig
	configPath, err := getAIConfigPath()
	if err != nil {
		return config, err
	}
	if _, err := os.Stat(configPath); err == nil {
		data, err := os.ReadFile(configPath)
		if err == nil {
			_ = json.Unmarshal(data, &config)
		}
	}

	if config.Google.APIKey != "" {
		if dec, err := decryptFn(config.Google.APIKey); err == nil {
			config.Google.APIKey = dec
		}
	}
	if config.Groq.APIKey != "" {
		if dec, err := decryptFn(config.Groq.APIKey); err == nil {
			config.Groq.APIKey = dec
		}
	}
	if config.Ollama.APIKey != "" {
		if dec, err := decryptFn(config.Ollama.APIKey); err == nil {
			config.Ollama.APIKey = dec
		}
	}
	if config.Upstage.APIKey != "" {
		if dec, err := decryptFn(config.Upstage.APIKey); err == nil {
			config.Upstage.APIKey = dec
		}
	}

	return config, nil
}

func ApiSaveAIConfig(config AIConfig, encryptFn func(string) (string, error)) error {
	// Encrypt keys before saving
	if config.Google.APIKey != "" {
		if enc, err := encryptFn(config.Google.APIKey); err == nil {
			config.Google.APIKey = enc
		}
	}
	if config.Groq.APIKey != "" {
		if enc, err := encryptFn(config.Groq.APIKey); err == nil {
			config.Groq.APIKey = enc
		}
	}
	if config.Ollama.APIKey != "" {
		if enc, err := encryptFn(config.Ollama.APIKey); err == nil {
			config.Ollama.APIKey = enc
		}
	}
	if config.Upstage.APIKey != "" {
		if enc, err := encryptFn(config.Upstage.APIKey); err == nil {
			config.Upstage.APIKey = enc
		}
	}

	configPath, err := getAIConfigPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

func ApiDeleteAIConfig() error {
	configPath, err := getAIConfigPath()
	if err != nil {
		return err
	}
	if _, err := os.Stat(configPath); err == nil {
		return os.Remove(configPath)
	}
	return nil
}

func ApiAiChat(prompt, fullContent, selectedContent, model string, decryptFn func(string) (string, error), sendChunkFn func(string, string, bool)) {
	go func() {
		sysPrompt := "답변 말투는 '이다. 한다.'로 하거나, 서술어를 생략한다. 예를 들어 '적용합니다.' 라는 말 대신 '적용한다.' 라고 하거나 '적용.' 으로 줄여 말한다. 질문에 답변만 하고, 사용자에게 질문을 하지 않는다. Markdown을 사용하지 않고, plain text로 답한다. 답변 내에 '<선택된_텍스트>'나 '<질문>'과 같은 XML 태그를 절대 그대로 노출하거나 인용하여 언급하지 않는다."

		var userPrompt string
		if selectedContent != "" {
			userPrompt = fmt.Sprintf("사용자의 질문은 <선택된_텍스트> %s </선택된_텍스트>에 관한 것이다. 이상의 글의 내용에 대한 다음 질문에 답하라:<질문>%s</질문>. 답변할 때 <선택된_텍스트>, <질문> 등의 XML 태그를 절대 답변 본문에 언급하거나 포함하지 말고 질문에 직접 답변하라.", selectedContent, prompt)
		} else {
			userPrompt = fmt.Sprintf("사용자의 질문은 <선택된_텍스트> %s </선택된_텍스트>에 관한 것이다. 이상의 글의 내용에 대한 다음 질문에 답하라:<질문>%s</질문>. 답변할 때 <선택된_텍스트>, <질문> 등의 XML 태그를 절대 답변 본문에 언급하거나 포함하지 말고 질문에 직접 답변하라.", fullContent, prompt)
		}

		parts := strings.SplitN(model, "|", 2)
		provider := "google"
		targetModel := model
		if len(parts) == 2 {
			provider = parts[0]
			targetModel = parts[1]
		}

		config, err := ApiGetAIConfig(decryptFn)
		if err != nil {
			sendChunkFn("", "❌ 설정을 불러올 수 없다.", true)
			return
		}

		switch provider {
		case "google":
			apiKey := config.Google.APIKey
			if apiKey == "" {
				sendChunkFn("", "❌ Google API 키가 설정되지 않았다.", true)
				return
			}
			geminiChatStream(apiKey, targetModel, sysPrompt, userPrompt, sendChunkFn)
		case "groq":
			apiKey := config.Groq.APIKey
			if apiKey == "" {
				sendChunkFn("", "❌ Groq API 키가 설정되지 않았다.", true)
				return
			}
			groqChatStream(apiKey, targetModel, sysPrompt, userPrompt, sendChunkFn)
		case "ollama":
			endpoint := config.Ollama.APIKey
			ollamaChatStream(endpoint, targetModel, sysPrompt, userPrompt, sendChunkFn)
		case "upstage":
			apiKey := config.Upstage.APIKey
			if apiKey == "" {
				sendChunkFn("", "❌ Upstage API 키가 설정되지 않았다.", true)
				return
			}
			upstageChatStream(apiKey, targetModel, sysPrompt, userPrompt, sendChunkFn)
		default:
			sendChunkFn("", "❌ 지원되지 않거나 알 수 없는 공급자 형식이다: "+provider, true)
		}
	}()
}

func geminiChatStream(apiKey, model, sysPrompt, userPrompt string, sendChunkFn func(string, string, bool)) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		fmt.Println("❌ Gemini 클라이언트 생성 실패:", err)
		sendChunkFn("", "❌ Gemini 클라이언트 초기화 실패: "+err.Error(), true)
		return
	}

	todayStr := time.Now().Format("2006년 01월 02일")
	dynamicSysPrompt := fmt.Sprintf("%s\n오늘 날짜는 %s입니다. 최신 정보는 구글 검색을 활용하세요.", sysPrompt, todayStr)

	config := &genai.GenerateContentConfig{
		Temperature: genai.Ptr[float32](0.2),
		Tools: []*genai.Tool{
			{GoogleSearch: &genai.GoogleSearch{}},
		},
	}

	if strings.TrimSpace(dynamicSysPrompt) != "" {
		config.SystemInstruction = &genai.Content{
			Parts: genai.Text(dynamicSysPrompt)[0].Parts,
			Role:  "user",
		}
	}

	iter := client.Models.GenerateContentStream(
		ctx,
		model,
		genai.Text(userPrompt),
		config,
	)

	for result, err := range iter {
		if err != nil {
			fmt.Println("❌ Gemini 스트림 오류:", err)
			sendChunkFn("", "❌ 스트리밍 오류: "+err.Error(), true)
			return
		}

		thinkingText := ""
		responseText := ""
		if result != nil && len(result.Candidates) > 0 {
			c := result.Candidates[0]
			if c.Content != nil {
				for _, part := range c.Content.Parts {
					if part.Thought {
						thinkingText += part.Text
					} else if part.Text != "" {
						responseText += part.Text
					}
				}
			}
		}

		sendChunkFn(thinkingText, responseText, false)
	}

	sendChunkFn("", "", true)
}

func groqChatStream(apiKey, model, sysPrompt, userPrompt string, sendChunkFn func(string, string, bool)) {
	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": sysPrompt},
			{"role": "user", "content": userPrompt},
		},
		"stream":      true,
		"temperature": 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		sendChunkFn("", "❌ Groq 요청 직렬화 오류: "+err.Error(), true)
		return
	}

	req, err := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		sendChunkFn("", "❌ Groq 요청 생성 오류: "+err.Error(), true)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	httpClient := &http.Client{
		Timeout: 120 * time.Second,
		Transport: &http.Transport{
			DisableCompression: true,
		},
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		sendChunkFn("", "❌ Groq 연결 오류: "+err.Error(), true)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		sendChunkFn("", fmt.Sprintf("❌ Groq API 오류 (HTTP %d): %s", resp.StatusCode, string(errBody)), true)
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 512*1024), 512*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			sendChunkFn("", "", true)
			return
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			sendChunkFn("", chunk.Choices[0].Delta.Content, false)
		}
	}

	if err := scanner.Err(); err != nil {
		sendChunkFn("", "❌ Groq 스트림 읽기 오류: "+err.Error(), true)
		return
	}
	sendChunkFn("", "", true)
}

func GetOllamaModels() ([]string, error) {
	cmd := exec.Command("ollama", "list")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	if err != nil {
		return nil, err
	}

	var models []string
	scanner := bufio.NewScanner(&out)
	if scanner.Scan() {
		_ = scanner.Text()
	}
	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) > 0 {
			models = append(models, fields[0])
		}
	}
	return models, nil
}

func ollamaChatStream(endpoint, model, sysPrompt, userPrompt string, sendChunkFn func(string, string, bool)) {
	if endpoint == "" {
		endpoint = "http://localhost:11434"
	}
	url := strings.TrimSuffix(endpoint, "/") + "/api/chat"

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": sysPrompt},
			{"role": "user", "content": userPrompt},
		},
		"stream": true,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		sendChunkFn("", "❌ Ollama 요청 직렬화 오류: "+err.Error(), true)
		return
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		sendChunkFn("", "❌ Ollama 요청 생성 오류: "+err.Error(), true)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{
		Timeout: 120 * time.Second,
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		sendChunkFn("", "❌ Ollama 연결 오류 (Ollama가 실행 중인지 확인하라): "+err.Error(), true)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		sendChunkFn("", fmt.Sprintf("❌ Ollama API 오류 (HTTP %d): %s", resp.StatusCode, string(errBody)), true)
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var chunk struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done bool `json:"done"`
		}
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			continue
		}
		if chunk.Message.Content != "" {
			sendChunkFn("", chunk.Message.Content, false)
		}
		if chunk.Done {
			sendChunkFn("", "", true)
			return
		}
	}

	if err := scanner.Err(); err != nil {
		sendChunkFn("", "❌ Ollama 스트림 읽기 오류: "+err.Error(), true)
		return
	}
	sendChunkFn("", "", true)
}

func upstageChatStream(apiKey, model, sysPrompt, userPrompt string, sendChunkFn func(string, string, bool)) {
	if model == "" {
		model = "solar-mini"
	}
	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": sysPrompt},
			{"role": "user", "content": userPrompt},
		},
		"stream":      true,
		"temperature": 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		sendChunkFn("", "❌ Upstage 요청 직렬화 오류: "+err.Error(), true)
		return
	}

	req, err := http.NewRequest("POST", "https://api.upstage.ai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		sendChunkFn("", "❌ Upstage 요청 생성 오류: "+err.Error(), true)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	httpClient := &http.Client{
		Timeout: 120 * time.Second,
		Transport: &http.Transport{
			DisableCompression: true,
		},
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		sendChunkFn("", "❌ Upstage 연결 오류: "+err.Error(), true)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		sendChunkFn("", fmt.Sprintf("❌ Upstage API 오류 (HTTP %d): %s", resp.StatusCode, string(errBody)), true)
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 512*1024), 512*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			sendChunkFn("", "", true)
			return
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			sendChunkFn("", chunk.Choices[0].Delta.Content, false)
		}
	}

	if err := scanner.Err(); err != nil {
		sendChunkFn("", "❌ Upstage 스트림 읽기 오류: "+err.Error(), true)
		return
	}
	sendChunkFn("", "", true)
}
