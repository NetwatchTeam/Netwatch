import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page introuvable" />
      <Link to="/">Retour à la vue d’ensemble</Link>
    </>
  );
}
