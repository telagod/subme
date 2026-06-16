//go:build unit

package repository

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"io"
	"net/http"
	"testing"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
	"github.com/stretchr/testify/require"
)

// TestDecompressResponseBody_Encodings 覆盖 decompressResponseBody 对各
// Content-Encoding 的处理，确保 zstd 上游响应体被正确解压（修复 #3252）。
func TestDecompressResponseBody_Encodings(t *testing.T) {
	const payload = `{"hello":"world","n":42}`

	cases := []struct {
		name     string
		encoding string
		compress func(t *testing.T, raw []byte) []byte
	}{
		{
			name:     "gzip",
			encoding: "gzip",
			compress: func(t *testing.T, raw []byte) []byte {
				var buf bytes.Buffer
				gw := gzip.NewWriter(&buf)
				_, err := gw.Write(raw)
				require.NoError(t, err)
				require.NoError(t, gw.Close())
				return buf.Bytes()
			},
		},
		{
			name:     "br",
			encoding: "br",
			compress: func(t *testing.T, raw []byte) []byte {
				var buf bytes.Buffer
				bw := brotli.NewWriter(&buf)
				_, err := bw.Write(raw)
				require.NoError(t, err)
				require.NoError(t, bw.Close())
				return buf.Bytes()
			},
		},
		{
			name:     "deflate",
			encoding: "deflate",
			compress: func(t *testing.T, raw []byte) []byte {
				var buf bytes.Buffer
				fw, err := flate.NewWriter(&buf, flate.DefaultCompression)
				require.NoError(t, err)
				_, err = fw.Write(raw)
				require.NoError(t, err)
				require.NoError(t, fw.Close())
				return buf.Bytes()
			},
		},
		{
			name:     "zstd",
			encoding: "zstd",
			compress: func(t *testing.T, raw []byte) []byte {
				var buf bytes.Buffer
				zw, err := zstd.NewWriter(&buf)
				require.NoError(t, err)
				_, err = zw.Write(raw)
				require.NoError(t, err)
				require.NoError(t, zw.Close())
				return buf.Bytes()
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			compressed := tc.compress(t, []byte(payload))

			resp := &http.Response{
				Header: http.Header{},
				Body:   io.NopCloser(bytes.NewReader(compressed)),
			}
			resp.Header.Set("Content-Encoding", tc.encoding)
			resp.Header.Set("Content-Length", "999") // 任意，仅验证会被清空

			decompressResponseBody(resp)

			got, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			require.NoError(t, resp.Body.Close())
			require.Equal(t, payload, string(got), "decompressed payload mismatch")

			require.Empty(t, resp.Header.Get("Content-Encoding"), "Content-Encoding 应被清除")
			require.Empty(t, resp.Header.Get("Content-Length"), "Content-Length 应被清除")
			require.EqualValues(t, -1, resp.ContentLength, "ContentLength 应置 -1")
		})
	}
}

// TestDecompressResponseBody_UnknownEncoding 未知编码应保持响应体不变。
func TestDecompressResponseBody_UnknownEncoding(t *testing.T) {
	const payload = "raw-bytes"
	resp := &http.Response{
		Header: http.Header{},
		Body:   io.NopCloser(bytes.NewReader([]byte(payload))),
	}
	resp.Header.Set("Content-Encoding", "mystery")

	decompressResponseBody(resp)

	got, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, payload, string(got))
	require.Equal(t, "mystery", resp.Header.Get("Content-Encoding"))
}

// TestDecompressResponseBody_ZstdInvalid 损坏的 zstd 流应优雅处理：
// NewReader 不会立即失败，但后续 Read 会返回错误，且原始 body 仍可读取/关闭。
func TestDecompressResponseBody_ZstdInvalid(t *testing.T) {
	resp := &http.Response{
		Header: http.Header{},
		Body:   io.NopCloser(bytes.NewReader([]byte("not-zstd-data"))),
	}
	resp.Header.Set("Content-Encoding", "zstd")

	// 不应 panic
	decompressResponseBody(resp)

	// 关闭 body 不应 panic
	_, _ = io.ReadAll(resp.Body)
	require.NotPanics(t, func() { _ = resp.Body.Close() })
}
