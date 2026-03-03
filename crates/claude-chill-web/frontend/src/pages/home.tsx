import { Activity, useEffect, useState, useTransition } from "react";
import { useNavigate, useParams } from "react-router";

import EmptyState from "@/components/EmptyState";
import NewSessionModal, {
  type SessionType,
} from "@/components/NewSessionModal";
import SessionView from "@/components/SessionView";
import Sidebar from "@/components/Sidebar";
import TabBar from "@/components/TabBar";
import type { Session } from "@/components/types";
import { useConfig, useSessions } from "@/lib/api";

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const navigate = useNavigate();
  const { sessionId: activeId } = useParams();

  const { data: serverSessions } = useSessions();
  const { data: config } = useConfig();

  useEffect(() => {
    if (!serverSessions) return;
    const serverIds = new Set(serverSessions.map((s) => s.id));
    const saved: Session[] = JSON.parse(
      localStorage.getItem("claude-chill-sessions") || "[]",
    );
    const restored = saved
      .filter((s) => s.sessionId && serverIds.has(s.sessionId))
      .map((s) => ({
        ...s,
        status: "connecting" as const,
        sessionType: s.sessionType || ("claude" as const),
      }));
    if (restored.length > 0) {
      setSessions(restored);
      if (!activeId || !restored.some((s) => s.id === activeId)) {
        navigate(`/session/${restored[0].id}`, { replace: true });
      }
    }
    setInitialized(true);
  }, [serverSessions, activeId, navigate]);

  useEffect(() => {
    if (initialized) {
      localStorage.setItem("claude-chill-sessions", JSON.stringify(sessions));
    }
  }, [sessions, initialized]);

  const selectSession = (id: string) => {
    startTransition(() => {
      navigate(`/session/${id}`);
    });
  };

  const createSession = (
    directory: string,
    name: string,
    sessionType: SessionType,
  ) => {
    const id = `pending-${Date.now()}`;
    setSessions((prev) => [
      ...prev,
      {
        id,
        directory,
        name,
        sessionId: null,
        status: "connecting",
        sessionType,
      },
    ]);
    startTransition(() => {
      navigate(`/session/${id}`);
    });
  };

  const closeSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session || !confirm(`Close session "${session.name}"?`)) return;
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (activeId === id) {
      startTransition(() => {
        if (remaining.length > 0) {
          navigate(`/session/${remaining[0].id}`);
        } else {
          navigate("/");
        }
      });
    }
  };

  const updateSessionId = (oldId: string, sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === oldId ? { ...s, id: sessionId, sessionId } : s,
      ),
    );
    if (activeId === oldId) {
      startTransition(() => {
        navigate(`/session/${sessionId}`, { replace: true });
      });
    }
  };

  const updateSessionStatus = (id: string, status: Session["status"]) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s)),
    );
  };

  return (
    <>
      <Sidebar
        sessions={sessions}
        activeId={activeId ?? null}
        onSelect={selectSession}
        onNewSession={() => {
          setModalKey((k) => k + 1);
          setModalOpen(true);
        }}
        onSettings={() => navigate("/settings")}
      />

      <div
        className={`flex-1 flex flex-col overflow-hidden ${isPending ? "opacity-80" : ""}`}
      >
        <TabBar
          sessions={sessions}
          activeId={activeId ?? null}
          onSelect={selectSession}
          onClose={closeSession}
        />

        <div className="flex-1 relative overflow-hidden">
          {sessions.length === 0 ? (
            <EmptyState onNewSession={() => setModalOpen(true)} />
          ) : (
            sessions.map((s) => (
              <Activity
                key={s.id}
                mode={s.id === activeId ? "visible" : "hidden"}
              >
                <SessionView
                  sessionData={s}
                  isActive={s.id === activeId}
                  onSessionIdChange={(sid) => updateSessionId(s.id, sid)}
                  onStatusChange={(status) => updateSessionStatus(s.id, status)}
                />
              </Activity>
            ))
          )}
        </div>
      </div>

      <NewSessionModal
        key={modalKey}
        isOpen={modalOpen}
        defaultDirectory={config?.default_directory ?? ""}
        onClose={() => setModalOpen(false)}
        onCreate={createSession}
      />
    </>
  );
}
