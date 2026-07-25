#include <stdlib.h>
#include <string.h>

#include "apple_intelligence_bridge.h"

// Pure-C stub used when Apple Intelligence (FoundationModels) is unavailable —
// e.g. a Command-Line-Tools-only toolchain whose swiftc cannot build even the
// Swift stub. It provides the exact C-ABI symbols the Rust bindings link
// against, all reporting "unavailable", so no Swift toolchain is required.

int is_apple_intelligence_available(void) {
    return 0;
}

AppleLLMResponse* process_text_with_system_prompt_apple(const char* system_prompt,
                                                        const char* user_content,
                                                        int max_tokens) {
    (void)system_prompt;
    (void)user_content;
    (void)max_tokens;

    AppleLLMResponse* response = (AppleLLMResponse*)malloc(sizeof(AppleLLMResponse));
    if (response == NULL) {
        return NULL;
    }
    response->response = NULL;
    response->success = 0;
    response->error_message =
        strdup("Apple Intelligence is not available in this build (SDK requirement not met).");
    return response;
}

void free_apple_llm_response(AppleLLMResponse* response) {
    if (response == NULL) {
        return;
    }
    if (response->response != NULL) {
        free(response->response);
    }
    if (response->error_message != NULL) {
        free(response->error_message);
    }
    free(response);
}
