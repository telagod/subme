<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4"
  >
    <div class="relative z-10 w-full max-w-md text-center">
      <!-- 404 Display -->
      <div class="mb-8">
        <div class="relative inline-block">
          <span class="text-[12rem] font-bold leading-none text-muted-foreground/15"
            >404</span
          >
          <div class="absolute inset-0 flex items-center justify-center">
            <div
              class="flex h-24 w-24 items-center justify-center rounded-lg border border-border bg-secondary "
            >
              <svg
                class="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Text Content -->
      <div class="mb-8">
        <h1 class="mb-3 text-2xl font-bold text-foreground">
          {{ t('errors.pageNotFound') }}
        </h1>
        <p class="text-muted-foreground">
          The page you are looking for doesn't exist or has been moved.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col justify-center gap-3 sm:flex-row">
        <Button variant="outline" @click="goBack">
          <Icon name="arrowLeft" size="md" class="mr-2" />
          Go Back
        </Button>
        <Button asChild>
          <router-link to="/dashboard">
            <Icon name="home" size="md" class="mr-2" />
            Go to Dashboard
          </router-link>
        </Button>
      </div>

      <!-- Help Link -->
      <p class="mt-8 text-sm text-muted-foreground">
        Need help?
        <a
          href="#"
          class="text-muted-foreground transition-colors hover:text-foreground"
        >
          Contact support
        </a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/components/icons/Icon.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const router = useRouter()

function goBack(): void {
  router.back()
}
</script>
