# The Daily Yam

*Everything I love, every morning.*

Un journal du matin privé, en anglais, pour Yamuna. Chaque jour à 6h (heure de Paris), un robot lit toutes les sources de `config/sources.yaml`, demande à Claude de résumer et de classer ce qu'il trouve, compose l'édition du jour et la range dans `data/`. Le site se redéploie tout seul dans la foulée.

## Comment ça marche

```
config/sources.yaml  ──►  scripts/aggregate.ts (GitHub Actions, 6h)  ──►  data/items.json + data/days/AAAA-MM-JJ.json
                                                                              │
                                                              Vercel rebuild  ▼
                                                      le site (Next.js, statique) + /api/ask (le bot)
```

- **`config/sources.yaml`** — le seul fichier à connaître. Les rubriques, leurs couleurs, les sources (flux RSS, chaînes YouTube, podcasts, pages web lues par Claude, recherches d'actualité), le profil de Yamuna, les règles (fenêtre de 48 h, 14 jours visibles, liste noire…). Le commentaire en tête explique comment ajouter une source ou une rubrique.
- **`scripts/aggregate.ts`** — le robot du matin. Lit, filtre, dédoublonne, fait résumer et noter chaque contenu par Claude (modèle rapide), choisit le mix de la home, écrit les récaps audio (modèle plus soigné) et la phrase d'accueil.
- **`.github/workflows/morning-edition.yml`** — lance le robot à 6h Paris (été comme hiver), puis commit `data/`. Se lance aussi à la main : onglet **Actions → Morning edition → Run workflow** (option « dry run » pour seulement vérifier que les sources répondent).
- **`data/`** — l'édition : `items.json` (tout ce qui est visible), `days/` (une édition par jour : mix, récaps, rapport des sources, consommation Claude), `cache/` (identifiants YouTube et flux podcast résolus), `archive/` (éditions de plus de 14 jours).
- **`app/`** — le site : accueil (mix du jour), une page par rubrique (récap audio, filtres par type, groupes Today / Yesterday / Coming up…), recherche sur tout le site, bot « Ask the Yam » en bas à droite.

## Modifier le journal

| Je veux…                       | Je fais…                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| ajouter une source             | un bloc `- name:` de plus sous la rubrique voulue dans `config/sources.yaml`               |
| ajouter une rubrique           | un bloc complet sous `categories:` (id, nom, couleurs, brief, sources) — tout le reste suit |
| bloquer un média               | son domaine dans `rules.blocked_domains`                                                   |
| changer la durée du récap      | `rules.audio_recap_minutes` / `audio_recap_long_minutes`                                   |
| ajuster le goût du robot       | `reader.profile`, `reader.loves`, `reader.avoids`, et le `brief` de chaque rubrique        |
| relancer l'édition maintenant  | GitHub → Actions → Morning edition → Run workflow                                          |

Toute modification de `config/sources.yaml` poussée sur `main` est prise en compte au prochain passage du robot.

## La voix

Les récaps sont lus par une voix britannique générée par OpenAI (`gpt-4o-mini-tts`, pilotée par la consigne `audio.instructions` de `config/sources.yaml`) et stockés dans un espace Vercel Blob (`yam-audio`) :

- le **briefing du matin** (toutes rubriques, 6 min) est généré par le robot à 6h, prêt au réveil ;
- les **récaps par rubrique** (6 et 12 min) sont générés **au premier appui sur lecture** par `/api/audio`, puis réutilisés pendant 14 jours ;
- la page **/voices** fait entendre chaque voix sur le même paragraphe ; « Use this voice » mémorise le choix sur le téléphone ;
- sans clé OpenAI ou sans Blob, le site retombe sur la voix du téléphone.

Réglages dans `config/sources.yaml` → `audio` : voix par défaut, liste des voix, consigne d'accent, durée du briefing, pré-génération des rubriques.

## Secrets et réglages

- **GitHub** → Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN` (pour le robot).
- **Vercel** → Project → Settings → Environment Variables → les trois mêmes (pour le bot et la voix à la demande).
- Optionnel : `YAM_FAST_MODEL` (défaut `claude-haiku-5-5`), `YAM_SMART_MODEL` (défaut `claude-sonnet-5-5`), `YAM_BOT_DAILY_LIMIT` (défaut 200 questions/jour).

## En local (pour les curieux)

```bash
npm install
cp .env.example .env.local        # puis coller la clé
npm run check-sources             # vérifie que les sources répondent, sans Claude
npm run aggregate                 # fabrique une édition complète dans data/
npm run dev                       # http://localhost:3000
```

## Ce que ça coûte

Le robot utilise Claude Haiku pour lire et résumer (quelques dizaines de centimes par jour au plus) et Claude Sonnet pour les sept récaps audio et la phrase d'accueil (quelques centimes). Le bot coûte à l'usage (une question = environ un centime, un peu plus si elle déclenche une recherche web). L'hébergement Vercel et GitHub Actions sont gratuits à cette échelle.
