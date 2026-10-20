# Constellations — histoires et anecdotes (fr)

Un fichier par constellation, nommé d'après son abréviation IAU (`Ori.md`, `UMa.md`…). Chaque fichier contient :

- un frontmatter YAML : `id` (abréviation IAU) et `sources` (liste de `{ title, url, license }`) ;
- `## Histoire` : récit mythologique du niveau Découverte (120 à 200 mots), variantes signalées ;
- `## Anecdotes` : exactement 3 puces, chaque fait chiffré étant vérifiable dans une source listée.

Structure vérifiée par `packages/content/src/stories.test.ts`.

## Attribution

Textes dérivés en partie de Wikipédia (fr.wikipedia.org), sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr), reformulés ; sources par fichier (frontmatter `sources`). Le contenu dérivé est lui-même diffusé sous CC BY-SA 4.0.

Les autres sources (Ian Ridpath, *Star Tales* ; communiqués ESO ; traductions d'Hygin) ont servi à vérifier des faits : aucun passage n'en est repris.

### Fiches écrites depuis #172

Wikipédia n'étant pas joignable depuis l'environnement de rédaction, ces fiches reposent uniquement sur des sources lues et épinglées à un commit :

- **textes antiques**, éditions numériques de la Perseus Digital Library (dépôts `PerseusDL/canonical-greekLit` au commit `0189b9c8d8d1`, `PerseusDL/canonical-latinLit` au commit `128a05afa9cc`) et d'Open Greek and Latin (`OpenGreekAndLatin/First1KGreek` au commit `03776b39f404`), toutes sous **CC BY-SA 4.0** (mention `<licence>` de chaque fichier TEI ou README du dépôt) : Aratos, *Phénomènes* (grec, éd. Mair) ; Hésiode, *Travaux* (trad. Evelyn-White) ; Homère, *Odyssée* (grec) ; Apollodore, *Bibliothèque* (trad. Frazer) ; Ovide, *Fastes* (latin) et *Métamorphoses* (trad. More) ; Hipparque, *Commentaire* (grec, éd. Manitius) ; Ptolémée, *Almageste* (grec, éd. Heiberg ; nombres d'étoiles par constellation, noms d'étoiles). Les récits sont racontés à nouveau en français, sans traduction suivie ;
- **Stellarium**, cultures du ciel `western` et `ruelle` (`Stellarium/stellarium-skycultures` au commit `014fbb5e5923`, texte et données « CC BY-SA », version non précisée, 4.0 retenue) : histoire des 88 constellations, noms anglais, astérismes ;
- **données du catalogue d'Asteria** déjà documentées dans `docs/DATA_SOURCES.md` : magnitudes et positions Hipparcos, noms IAU WGSN, objets OpenNGC, distance de Deneb (Schiller & Przybilla 2008). Les rangs (« cinquième étoile la plus brillante »), séparations angulaires et hauteurs maximales sont calculés à partir de ces données ; les dates de passage du Soleil et les constellations voisines, avec `Constellation()` d'astronomy-engine 2.1.19 (frontières officielles, Roman 1987).

Une constellation sans mythe dans ces sources le dit (ex. `CMi.md`, `Cru.md`) plutôt que d'en inventer un.
