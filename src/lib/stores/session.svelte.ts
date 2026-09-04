import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { SocialLogin } from '@capgo/capacitor-social-login'
import type { User } from '@supabase/supabase-js'
import {
  PUBLIC_GOOGLE_WEB_CLIENT_ID,
  PUBLIC_GOOGLE_IOS_CLIENT_ID,
} from '$env/static/public'
import { supabase } from '$lib/supabase'

const STORAGE_KEY = 'qq.deviceId'

let deviceId = $state<string | null>(null)
let deviceReady = $state(false)
let user = $state<User | null>(null)
let authReady = $state(false)
let mergedThisSession = false
let socialLoginReady: Promise<void> | null = null

/**
 * Identity for likes/downloads without any auth: on native, Capacitor's
 * Device.getId() is stable across reinstalls, so it's used directly. On
 * web, Device.getId() returns a fresh random id per call, so a generated
 * id is persisted in localStorage instead.
 */
async function resolveDeviceId(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { identifier } = await Device.getId()
    return identifier
  }
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const generated = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, generated)
  return generated
}

const deviceIdPromise = resolveDeviceId().then((id) => {
  deviceId = id
  deviceReady = true
  return id
})

/** Returns the current device id, resolving it on first use. */
export async function ensureDeviceId(): Promise<string> {
  return deviceId ?? deviceIdPromise
}

function ensureSocialLoginInitialized(): Promise<void> {
  if (!socialLoginReady) {
    socialLoginReady = SocialLogin.initialize({
      google: {
        webClientId: PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iOSClientId: PUBLIC_GOOGLE_IOS_CLIENT_ID,
        iOSServerClientId: PUBLIC_GOOGLE_IOS_CLIENT_ID,
      },
    })
  }
  return socialLoginReady
}

/** Merges this device's pre-login likes/downloads into the account, once per session. */
/** Retry delays for PGRST303 ("JWT issued at future") — a clock-skew race
 *  between Auth issuing a fresh token and PostgREST validating it, seen
 *  right after magic-link sign-in. Retrying a beat later resolves it. */
const JWT_CLOCK_SKEW_RETRY_DELAYS_MS = [500, 1500]

async function mergeDeviceOnce() {
  if (mergedThisSession) return
  mergedThisSession = true
  const id = await ensureDeviceId()

  let error = (
    await supabase.rpc('merge_device_into_account', { p_device_id: id })
  ).error
  for (const delay of JWT_CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!error || error.code !== 'PGRST303') break
    await new Promise((resolve) => setTimeout(resolve, delay))
    error = (
      await supabase.rpc('merge_device_into_account', { p_device_id: id })
    ).error
  }
  if (error) console.error('merge_device_into_account failed', error)
}

supabase.auth.getSession().then(({ data, error }) => {
  if (error) console.error('getSession failed', error)
  user = data.session?.user ?? null
  authReady = true
  // console.debug('[auth] initial session', { userId: user?.id ?? null })
})

supabase.auth.onAuthStateChange((event, session) => {
  // console.debug('[auth] state change', event, { userId: session?.user?.id ?? null, })
  user = session?.user ?? null
  if (event === 'SIGNED_IN') mergeDeviceOnce()
  if (event === 'SIGNED_OUT') mergedThisSession = false
})

/** Sends a magic link to sign in or sign up by email. */
export async function signInWithEmailOtp(email: string): Promise<void> {
  // console.debug('[auth] signInWithEmailOtp', { email, redirectTo: window.location.origin, })
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) {
    console.error('[auth] signInWithOtp failed', error)
    throw error
  }
}

export async function signInWithGoogle(): Promise<void> {
  await ensureSocialLoginInitialized()
  const { result } = await SocialLogin.login({
    provider: 'google',
    options: { prompt: 'select_account' },
  })
  if (result.responseType !== 'online' || !result.idToken) {
    throw new Error('Google sign-in did not return an id token')
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: result.idToken,
  })
  if (error) throw error
}

export async function signInWithApple(): Promise<void> {
  await ensureSocialLoginInitialized()
  const { result } = await SocialLogin.login({ provider: 'apple', options: {} })
  if (!result.idToken) {
    throw new Error('Apple sign-in did not return an id token')
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: result.idToken,
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export const auth = {
  get deviceId() {
    return deviceId
  },
  get deviceReady() {
    return deviceReady
  },
  get user() {
    return user
  },
  get userId() {
    return user?.id ?? null
  },
  get ready() {
    return authReady
  },
}
