import { useEffect, useState } from "react";
import { HardDriveDownload } from "lucide-react";
import { reconnectBackupFile, subscribeAutoBackup, type AutoBackupState } from "../../domain/backup";

/** Shown when the automatic backup file lost its permission (browser restart). */
export function BackupBanner() {
  const [s, setS] = useState<AutoBackupState | null>(null);
  useEffect(() => {
    const off = subscribeAutoBackup(setS);
    return () => {
      off();
    };
  }, []);
  if (!s?.enabled || !s.needsPermission) return null;
  return (
    <div className="banner">
      <HardDriveDownload />
      <div style={{ flex: 1 }}>
        <strong>Reative o backup automático</strong>
        <div className="hint" style={{ padding: 0 }}>
          O navegador pede sua confirmação para continuar salvando em “{s.fileName}”.
        </div>
      </div>
      <button className="btn btn--primary btn--sm" onClick={() => reconnectBackupFile()}>
        Permitir
      </button>
    </div>
  );
}
