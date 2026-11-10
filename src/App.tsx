import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { UiProvider } from "./ui/UiProvider";
import { Layout } from "./features/shell/Layout";
import { HomePage } from "./features/home/HomePage";
import { FolderPage } from "./features/home/FolderPage";
import { DeckPage } from "./features/deck/DeckPage";
import { LearnPage } from "./features/learn/LearnPage";
import { DeckSettingsPage } from "./features/deck-settings/DeckSettingsPage";
import { AlgorithmSettingsPage } from "./features/deck-settings/AlgorithmSettingsPage";
import { CardStylePage } from "./features/deck-settings/CardStylePage";
import { TtsSettingsPage } from "./features/deck-settings/TtsSettingsPage";
import { ArchivePage } from "./features/archive/ArchivePage";
import { TrashPage } from "./features/archive/TrashPage";
import { ActivityPage } from "./features/activity/ActivityPage";
import { AppSettingsPage } from "./features/settings/AppSettingsPage";
import { NotFoundPage } from "./features/shell/NotFoundPage";
import { useTheme } from "./hooks/useTheme";
import { requestPersistentStorage, initAutoBackup } from "./domain/backup";
import { purgeExpiredTrash } from "./db/repo";

const NoteEditorPage = lazy(() => import("./features/editor/NoteEditorPage").then((m) => ({ default: m.NoteEditorPage })));
const ImportPage = lazy(() => import("./features/import/ImportPage").then((m) => ({ default: m.ImportPage })));
const AiGeneratePage = lazy(() => import("./features/ai/AiGeneratePage").then((m) => ({ default: m.AiGeneratePage })));
const L = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>{children}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/folder/:id", element: <FolderPage /> },
      { path: "/deck/:id", element: <DeckPage /> },
      { path: "/deck/:id/add", element: <L><NoteEditorPage /></L> },
      { path: "/deck/:id/note/:noteId", element: <L><NoteEditorPage /></L> },
      { path: "/deck/:id/settings", element: <DeckSettingsPage /> },
      { path: "/deck/:id/settings/algorithm", element: <AlgorithmSettingsPage /> },
      { path: "/deck/:id/settings/tts", element: <TtsSettingsPage /> },
      { path: "/deck/:id/style", element: <CardStylePage /> },
      { path: "/deck/:id/import", element: <L><ImportPage /></L> },
      { path: "/import", element: <L><ImportPage /></L> },
      { path: "/archive", element: <ArchivePage /> },
      { path: "/trash", element: <TrashPage /> },
      { path: "/activity", element: <ActivityPage /> },
      { path: "/settings", element: <AppSettingsPage /> },
      { path: "/ai", element: <L><AiGeneratePage /></L> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  { path: "/learn/:deckId", element: <LearnPage /> },
]);

export function App() {
  useTheme();
  useEffect(() => {
    requestPersistentStorage();
    initAutoBackup();
    purgeExpiredTrash();
  }, []);
  return (
    <UiProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </UiProvider>
  );
}
