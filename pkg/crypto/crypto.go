package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"syscall"
	"unsafe"
)

var (
	crypt32                = syscall.NewLazyDLL("crypt32.dll")
	procCryptProtectData   = crypt32.NewProc("CryptProtectData")
	procCryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
)

type DATA_BLOB struct {
	CbData uint32
	PbData *byte
}

// CryptoKey is the 32-byte key used for AES-256 encryption.
var CryptoKey = []byte("StyledMDSecretKeyForAPIEncryption")[:32]

// CryptProtect calls Windows DPAPI CryptProtectData to encrypt data bound to the current Windows user session.
func CryptProtect(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var in DATA_BLOB
	var out DATA_BLOB

	in.CbData = uint32(len(data))
	in.PbData = &data[0]

	r, _, err := procCryptProtectData.Call(
		uintptr(unsafe.Pointer(&in)),
		0, // No description
		0, // No entropy
		0, // Reserved
		0, // Prompt struct
		0, // Flags
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, fmt.Errorf("Windows DPAPI Encryption failed: %v", err)
	}
	defer syscall.LocalFree(syscall.Handle(unsafe.Pointer(out.PbData)))

	result := make([]byte, out.CbData)
	copy(result, unsafe.Slice(out.PbData, out.CbData))
	return result, nil
}

// CryptUnprotect calls Windows DPAPI CryptUnprotectData to decrypt data bound to the current Windows user session.
func CryptUnprotect(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, nil
	}
	var in DATA_BLOB
	var out DATA_BLOB

	in.CbData = uint32(len(data))
	in.PbData = &data[0]

	r, _, err := procCryptUnprotectData.Call(
		uintptr(unsafe.Pointer(&in)),
		0, // No description
		0, // No entropy
		0, // Reserved
		0, // Prompt struct
		0, // Flags
		uintptr(unsafe.Pointer(&out)),
	)
	if r == 0 {
		return nil, fmt.Errorf("Windows DPAPI Decryption failed: %v", err)
	}
	defer syscall.LocalFree(syscall.Handle(unsafe.Pointer(out.PbData)))

	result := make([]byte, out.CbData)
	copy(result, unsafe.Slice(out.PbData, out.CbData))
	return result, nil
}

// Encrypt encrypts plain text using AES-GCM and then wraps it with Windows DPAPI, returning a base64 string.
func Encrypt(text string) (string, error) {
	if text == "" {
		return "", nil
	}
	block, err := aes.NewCipher(CryptoKey)
	if err != nil {
		return "", err
	}
	plaintext := []byte(text)
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Wrap with Windows DPAPI
	dpapiCipher, err := CryptProtect(ciphertext)
	if err != nil {
		return "", err
	}

	return base64.StdEncoding.EncodeToString(dpapiCipher), nil
}

// Decrypt unwraps Windows DPAPI and decrypts the cipher text using AES-GCM, returning plain text.
func Decrypt(cryptoText string) (string, error) {
	if cryptoText == "" {
		return "", nil
	}
	dpapiCipher, err := base64.StdEncoding.DecodeString(cryptoText)
	if err != nil {
		return "", err
	}

	// Unwrap Windows DPAPI
	ciphertext, err := CryptUnprotect(dpapiCipher)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(CryptoKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, actualCiphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
