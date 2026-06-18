import { createClient } from "@supabase/supabase-js";
import type { ChatBootstrap, ChatChannel, ChatMessage } from "../types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

declare global {
  var __operoSupabaseRealtimeClient: ReturnType<typeof createClient> | undefined;
}

export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase browser client is not configured.");
  }

  if (!globalThis.__operoSupabaseRealtimeClient) {
    globalThis.__operoSupabaseRealtimeClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return globalThis.__operoSupabaseRealtimeClient;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Chat request failed");
  }
  return payload as T;
}

export async function listChannels() {
  const response = await fetch("/api/tenant/chat/channels", {
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<ChatBootstrap>(response);
}

export async function createChannel(input: { name: string; description?: string }) {
  const response = await fetch("/api/tenant/chat/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{ channel: ChatChannel }>(response);
}

export async function listMessages(channelId: string) {
  const response = await fetch(`/api/tenant/chat/channels/${channelId}/messages`, {
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{ messages: ChatMessage[] }>(response);
}

export async function sendChannelMessage(channelId: string, content: string, replyToId?: string) {
  const response = await fetch(`/api/tenant/chat/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, ...(replyToId ? { replyToId } : {}) }),
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{ message: ChatMessage }>(response);
}

export async function markChannelRead(channelId: string) {
  const response = await fetch(`/api/tenant/chat/channels/${channelId}/read`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{
    channelId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    unreadCount: 0;
  }>(response);
}

export async function deleteChannel(channelId: string) {
  const response = await fetch(`/api/tenant/chat/channels/${channelId}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{ success: true }>(response);
}

export async function deleteMessage(messageId: string) {
  const response = await fetch(`/api/tenant/chat/messages/${messageId}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "include",
  });
  return parseResponse<{ success: true }>(response);
}
