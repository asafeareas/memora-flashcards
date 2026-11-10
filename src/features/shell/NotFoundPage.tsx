import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../../ui/controls";

export function NotFoundPage({ title = "Página não encontrada", text = "O endereço não existe ou o item foi removido." }: { title?: string; text?: string }) {
  return (
    <EmptyState icon={<Compass />} title={title} text={text}>
      <Link to="/" className="btn btn--primary">
        Voltar ao início
      </Link>
    </EmptyState>
  );
}
