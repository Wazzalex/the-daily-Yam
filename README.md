# The Daily Yam

*Everything I love, every morning.*

Un journal privé, en anglais, pour Yamuna. Deux rendez-vous :

- **The Daily Yam** — chaque matin à 6h (heure de Paris), un audio de 3–4 minutes sur la littérature et la culture, avec sa transcription. Rien d'autre à lire.
- **The Weekly Yam** — le samedi, par rubrique (Literature, Art, What to watch, Britain & the world), **2 choses à écouter et 2 à lire au maximum**, choisies dans la réserve de la semaine.

Plus deux onglets personnels : **Words** (20 mots de sa liste par semaine, à écouter, répéter et réviser) et **Bookshelf** (ses livres, chacun avec une fiche « Remember this book » en texte et en audio).

## Comment ça marche

```
config/sources.yaml ──► scripts/aggregate.ts (GitHub Actions, chaque matin) ──► data/pool.json (réserve 14 j)
                                                                               ├─► data/daily/AAAA-MM-JJ.json  (script + audio)
                                      le samedi : sélection + Words + livre ──► data/weekly/…  data/words/…  data/books/…
                                                                               │
                                                               Vercel rebuild  ▼
                                                 le site (Next.js) + /api/ask (bot) + /api/audio (voix) + /api/book
```

- **`config/sources.yaml`** — rubriques, couleurs, sources, profil de Yamuna, réglages des deux éditions (`editions:`), voix (`audio:`), document de vocabulaire (`words:`). Le commentaire en tête explique comment ajouter une source ou une rubrique.
- **`config/books.yaml`** — la liste des livres de l'étagère (titre, auteur, note).
- **`scripts/aggregate.ts`** — le robot. Chaque jour : lit les sources, fait juger et annoter les nouveautés par Claude Haiku, alimente la réserve, fait écrire le Daily par Claude Sonnet, génère l'audio. Le samedi (ou `--weekly`) : choisit les écoutes et lectures de la semaine, construit la session Words depuis le Google Doc, tire un livre de la semaine.
- **`.github/workflows/morning-edition.yml`** — quatre créneaux le matin ; chaque lancement vérifie si le Daily du jour existe déjà (GitHub démarre les tâches avec du retard). *Run workflow* permet de forcer, de lancer le Weekly, ou un essai à blanc.
- **`data/`** — `pool.json` (réserve), `daily/`, `weekly/` (+ `.items.json`, l'instantané des contenus choisis), `words/` (sessions + `registry.json` pour la répétition espacée), `books/` (fiches), `archive/`.

## Modifier le journal

| Je veux…                                   | Je fais…                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ajouter une source                         | un bloc `- name:` de plus sous la rubrique voulue dans `config/sources.yaml`               |
| ajouter une rubrique                       | un bloc complet sous `categories:` — l'onglet et la sélection du samedi suivent            |
| changer le nombre d'écoutes / lectures     | `editions.weekly.per_section`                                                              |
| allonger ou raccourcir le Daily            | `editions.daily.minutes`                                                                   |
| bloquer un média                           | son domaine dans `rules.blocked_domains`                                                   |
| ajouter des mots                           | Yamuna écrit dans son Google Doc « The Daily Yam — Words », sous la ligne                  |
| ajouter des livres                         | `config/books.yaml` (titre + auteur)                                                       |
| relancer maintenant                        | GitHub → Actions → Morning edition → Run workflow (cocher *weekly* pour la sélection)      |

## La voix

Voix britannique OpenAI (`gpt-4o-mini-tts`, consigne dans `audio.instructions`), fichiers dans Vercel Blob (`yam-audio`). Le Daily est pré-généré par le robot (et, en filet de sécurité, par le site lui-même juste après le déploiement). Les clips Words et les fiches livres sont générés à la demande puis conservés. La page **/voices** permet de choisir sa voix. Sans clé OpenAI ou sans Blob, le site retombe sur la voix du téléphone.

## Secrets

- **GitHub** → Settings → Secrets and variables → Actions : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`.
- **Vercel** → Project → Settings → Environment Variables : les trois mêmes.

## En local

```bash
npm install
cp .env.example .env.local        # puis coller les clés
npm run check-sources             # vérifie que les sources répondent, sans Claude
npm run aggregate                 # le Daily du jour
npm run aggregate -- --weekly     # + le Weekly, Words et le livre de la semaine
npm run dev                       # http://localhost:3000
```

## Ce que ça coûte

Le Daily : environ 0,25–0,35 € par jour (jugement des nouveautés par Haiku, script par Sonnet, 4 minutes de voix). Le Weekly : environ 2 € le samedi (sélection, mots, livre). Soit **10 à 15 € par mois**, contre 45 € pour la version quotidienne complète. Le bot et les fiches livres coûtent à l'usage (quelques centimes).
