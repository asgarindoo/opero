"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";
import useSWR from "swr";
import { useTenant } from "@/components/providers/TenantProvider";
import { fetchChannels, createChannel as apiCreate, updateChannel as apiUpdate, deleteChannel as apiDelete } from "../services/channels.client";

export type ChannelStatus = "Active" | "Inactive" | "Archived";
export type ChannelCategory = "Social" | "Email" | "Community" | "Marketplace" | "Custom";

export interface Channel {
   id: string;
   name: string;
   accountName?: string;
   platform: string;
   handle?: string;
   username: string;
   profileUrl?: string;
   profileLink: string;
   status: ChannelStatus;
   followers: number;
   postsThisMonth: number;
   interactions: number;
   monthlyReach?: number;
   averageViews?: number;
   notes: string;
}

interface SocialChannelsContextType {
  channels: Channel[];
  loading: boolean;
  setChannels: React.Dispatch<React.SetStateAction<Channel[]>>;
  addChannel: (channel: Channel) => Promise<void>;
  updateChannel: (id: string, channel: Partial<Channel>) => Promise<void>;
  removeChannel: (id: string) => Promise<void>;
}

const SocialChannelsContext = createContext<SocialChannelsContextType | undefined>(undefined);

export function SocialChannelsProvider({ children }: { children: React.ReactNode }) {
  const { tenantId } = useTenant();
  const { data, mutate, isLoading } = useSWR<Channel[]>(["social-channels", tenantId], fetchChannels, {
    fallbackData: [],
    keepPreviousData: true,
  });

  const channels = data || [];

  const addChannel = useCallback(async (channel: Channel) => {
    await mutate(
      async (current = []) => {
        const created = await apiCreate(channel);
        return [created, ...current.filter((c) => c.id !== channel.id && c.id !== created.id)];
      },
      {
        optimisticData: (current = []) => [channel, ...current],
        rollbackOnError: true,
        revalidate: false,
      }
    );
  }, [mutate]);
  
  const updateChannel = useCallback(async (id: string, updates: Partial<Channel>) => {
    await mutate(
      async (current = []) => {
        const updated = await apiUpdate(id, updates);
        return current.map((c) => c.id === id ? updated : c);
      },
      {
        optimisticData: (current = []) => current.map(c => c.id === id ? { ...c, ...updates } : c),
        rollbackOnError: true,
        revalidate: false,
      }
    );
  }, [mutate]);
  
  const removeChannel = useCallback(async (id: string) => {
    await mutate(
      async (current = []) => {
        await apiDelete(id);
        return current.filter(c => c.id !== id);
      },
      {
        optimisticData: (current = []) => current.filter(c => c.id !== id),
        rollbackOnError: true,
        revalidate: false,
      }
    );
  }, [mutate]);

  const value = useMemo(() => ({
    channels,
    loading: isLoading,
    setChannels: () => {},

    addChannel,
    updateChannel,
    removeChannel
  }), [addChannel, channels, isLoading, removeChannel, updateChannel]);

  return <SocialChannelsContext.Provider value={value}>{children}</SocialChannelsContext.Provider>;
}

export function useSocialChannels() {
  const context = useContext(SocialChannelsContext);
  if (context === undefined) {
    throw new Error("useSocialChannels must be used within a SocialChannelsProvider");
  }
  return context;
}
