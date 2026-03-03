import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Types
export interface Config {
  default_directory: string;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirResponse {
  entries: DirEntry[];
  exists: boolean;
}

export interface SessionInfo {
  id: string;
  directory?: string;
}

// Fetchers
const fetchConfig = async (): Promise<Config> => {
  const res = await fetch("/api/config");
  return res.json();
};

const updateConfig = async (config: Partial<Config>): Promise<Config> => {
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
};

const fetchDirectories = async (path: string): Promise<DirResponse> => {
  const res = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
  return res.json();
};

const fetchSessions = async (): Promise<SessionInfo[]> => {
  const res = await fetch("/api/sessions");
  return res.json();
};

// Hooks
export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: fetchConfig });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config"] }),
  });
}

export function useDirectories(path: string) {
  return useQuery({
    queryKey: ["directories", path],
    queryFn: () => fetchDirectories(path),
    enabled: !!path,
    staleTime: 30000,
  });
}

export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
}
