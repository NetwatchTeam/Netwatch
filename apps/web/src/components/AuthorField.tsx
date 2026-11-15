interface AuthorFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Champ « Votre nom » : obligatoire, car chaque décision est tracée avec son auteur. */
export function AuthorField({ value, onChange }: AuthorFieldProps) {
  return (
    <label>
      Votre nom
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Prénom Nom"
        maxLength={80}
        required
        autoComplete="name"
      />
      <span className="field-hint">Enregistré dans l’historique de l’équipement.</span>
    </label>
  );
}
