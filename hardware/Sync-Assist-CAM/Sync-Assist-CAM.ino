#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "esp_camera.h"
#include "mbedtls/base64.h"

// ─── Configuration ───────────────────────────────────────────────────────────
#define WIFI_SSID     "LEE_WIFI_2.40GHz"
#define WIFI_PASSWORD "Robert0163303567#"
#define BACKEND_URL   "https://satisfy-infants-consistency-talks.trycloudflare.com"

#define CAPTURE_INTERVAL_MS 120000
#define JPEG_QUALITY        12
#define FRAME_SIZE          FRAMESIZE_VGA

// ─── Ai Thinker ESP32-CAM pin definitions ────────────────────────────────────
#define PWDN_GPIO_NUM    32
#define RESET_GPIO_NUM   -1
#define XCLK_GPIO_NUM     0
#define SIOD_GPIO_NUM    26
#define SIOC_GPIO_NUM    27
#define Y9_GPIO_NUM      35
#define Y8_GPIO_NUM      34
#define Y7_GPIO_NUM      39
#define Y6_GPIO_NUM      36
#define Y5_GPIO_NUM      21
#define Y4_GPIO_NUM      19
#define Y3_GPIO_NUM      18
#define Y2_GPIO_NUM       5
#define VSYNC_GPIO_NUM   25
#define HREF_GPIO_NUM    23
#define PCLK_GPIO_NUM    22

// ─── Globals ─────────────────────────────────────────────────────────────────
WiFiClientSecure secureClient;
unsigned long lastCaptureTime = 0;

bool initCamera() {
  camera_config_t camera_config;
  camera_config.ledc_channel = LEDC_CHANNEL_0;
  camera_config.ledc_timer   = LEDC_TIMER_0;
  camera_config.pin_d0       = Y2_GPIO_NUM;
  camera_config.pin_d1       = Y3_GPIO_NUM;
  camera_config.pin_d2       = Y4_GPIO_NUM;
  camera_config.pin_d3       = Y5_GPIO_NUM;
  camera_config.pin_d4       = Y6_GPIO_NUM;
  camera_config.pin_d5       = Y7_GPIO_NUM;
  camera_config.pin_d6       = Y8_GPIO_NUM;
  camera_config.pin_d7       = Y9_GPIO_NUM;
  camera_config.pin_xclk    = XCLK_GPIO_NUM;
  camera_config.pin_pclk    = PCLK_GPIO_NUM;
  camera_config.pin_vsync   = VSYNC_GPIO_NUM;
  camera_config.pin_href    = HREF_GPIO_NUM;
  camera_config.pin_sccb_sda = SIOD_GPIO_NUM;
  camera_config.pin_sccb_scl = SIOC_GPIO_NUM;
  camera_config.pin_pwdn    = PWDN_GPIO_NUM;
  camera_config.pin_reset   = RESET_GPIO_NUM;
  camera_config.xclk_freq_hz = 20000000;
  camera_config.pixel_format  = PIXFORMAT_JPEG;
  camera_config.grab_mode     = CAMERA_GRAB_LATEST;

  if (psramFound()) {
    camera_config.frame_size   = FRAME_SIZE;
    camera_config.jpeg_quality = JPEG_QUALITY;
    camera_config.fb_count     = 1;
    camera_config.fb_location  = CAMERA_FB_IN_PSRAM;
    Serial.println("PSRAM found, using PSRAM for frame buffer");
  } else {
    camera_config.frame_size   = FRAMESIZE_SVGA;
    camera_config.jpeg_quality = 20;
    camera_config.fb_count     = 1;
    camera_config.fb_location  = CAMERA_FB_IN_DRAM;
    Serial.println("WARNING: No PSRAM found, falling back to DRAM");
  }

  esp_err_t err = esp_camera_init(&camera_config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return false;
  }
  return true;
}

// Returns a heap-allocated base64 string with "data:image/jpeg;base64," prefix.
// Caller must free() the returned pointer.
char* captureAndEncode(camera_fb_t *fb, size_t *out_len) {
  size_t base64_len = ((4 * fb->len / 3) + 3) & ~3;
  size_t prefix_len = 23;  // len("data:image/jpeg;base64,")
  size_t total_len  = prefix_len + base64_len + 1;

  char *base64_buf = (char *)ps_malloc(total_len);
  if (!base64_buf) {
    Serial.println("ERROR: Failed to allocate Base64 buffer in PSRAM");
    return NULL;
  }

  memcpy(base64_buf, "data:image/jpeg;base64,", prefix_len);

  size_t encoded_len = 0;
  int ret = mbedtls_base64_encode(
    (unsigned char *)(base64_buf + prefix_len),
    base64_len + 1,
    &encoded_len,
    fb->buf,
    fb->len
  );

  if (ret != 0) {
    Serial.printf("ERROR: Base64 encode failed with code %d\n", ret);
    free(base64_buf);
    return NULL;
  }

  base64_buf[prefix_len + encoded_len] = '\0';
  *out_len = prefix_len + encoded_len;
  return base64_buf;
}

bool uploadImage() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("ERROR: Camera capture failed");
    return false;
  }

  size_t encoded_len = 0;
  char *encoded = captureAndEncode(fb, &encoded_len);
  size_t jpeg_size = fb->len;
  esp_camera_fb_return(fb);

  if (!encoded) return false;

  // Build JSON body via String concatenation to avoid ArduinoJson heap limits
  // with large base64 payloads
  String body = "{\"farm_id\":\"RACK_ALPHA\",\"image\":\"";
  body += encoded;
  body += "\"}";
  free(encoded);

  HTTPClient http;
  http.begin(secureClient, BACKEND_URL "/api/sensors/image");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(30000);

  int code = http.POST(body);
  if (code == 200) {
    Serial.printf("Backend image write OK (%u bytes JPEG, %u bytes Base64)\n",
                  jpeg_size, encoded_len);
    http.end();
    return true;
  } else {
    Serial.printf("Backend image write FAILED: HTTP %d\n", code);
    http.end();
    return false;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    Serial.print(".");
    delay(500);
    retries++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi connection failed, restarting...");
    ESP.restart();
  }
  Serial.println();
  Serial.print("Connected with IP: ");
  Serial.println(WiFi.localIP());

  secureClient.setInsecure();

  if (!initCamera()) {
    Serial.println("Camera init failed, restarting...");
    delay(1000);
    ESP.restart();
  }
  Serial.println("Camera initialized successfully");

  // Test capture to verify full pipeline
  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    Serial.printf("Test capture OK: %dx%d, %u bytes JPEG\n", fb->width, fb->height, fb->len);
    size_t encoded_len = 0;
    char *encoded = captureAndEncode(fb, &encoded_len);
    if (encoded) {
      Serial.printf("Base64 encode OK: %u bytes encoded\n", encoded_len);
      free(encoded);
    }
    esp_camera_fb_return(fb);
  } else {
    Serial.println("Test capture FAILED");
  }
}

void loop() {
  if (millis() - lastCaptureTime >= CAPTURE_INTERVAL_MS || lastCaptureTime == 0) {
    lastCaptureTime = millis();
    if (WiFi.status() == WL_CONNECTED) {
      uploadImage();
    } else {
      Serial.println("WiFi disconnected, skipping capture");
    }
  }
}
