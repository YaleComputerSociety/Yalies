# Name search

The web app's `full_name` mode searches only legal first names, preferred names,
and surnames. Explicit initials searches keep their existing behavior.

Names and queries use the same PostgreSQL normalization: Unicode decomposition,
accent/ligature folding, lowercase, apostrophe removal, and word separation at
hyphens and other punctuation. For example, `ana` matches `Ànabele`, and
`jose nunez` matches `José Núñez`.

## Progressive matching

Search stops at the first tier with any results **within the active filters**.
One good result is sufficient; search does not add weaker results to fill a page.

| Tier | Eligible matches |
| --- | --- |
| 0 | Every query word exactly matches or prefixes a distinct name word |
| 1 | Every word matches, allowing literal substrings |
| 2 | Every word matches, allowing one nearby QWERTY substitution, adjacent transposition, insertion, or deletion |
| 3 | Every word matches, allowing guarded phonetic spelling variations |
| 4 | Every word matches, allowing additional bounded typing errors |
| Fallback | If all full-name tiers fail, search each query word independently through the same tiers and combine the results |

Full-name matching accepts reversed word order and compound names. A name word
cannot satisfy two query words, and legal and preferred first names are separate
alternatives. Thus `john johnson` works without letting `john john` pass as a
full-name match for John Smith.

Within the successful tier, single-word queries first prioritize legal or preferred
first names beginning with that query over surname or interior-word matches.
Results then rank by average query-word closeness. Exact
words score 1, prefixes 0.96, and substrings 0.9. Typo scores are
`1 - weighted edit cost / query word length`. Nearby US QWERTY substitutions and
adjacent transpositions cost 0.5, insertions/deletions cost 0.8, and other
substitutions cost 1. Additional typo tolerance is capped at `min(2.4, 0.3 * query
word length)` and at one edit for three-letter terms, two for four-to-seven-letter
terms, and three for longer terms. One- and two-letter terms remain literal.

Phonetic matches use primary/alternate Double Metaphone and Soundex keys, with a
weighted edit cost capped at `min(3, 0.65 * query word length)`. These encoders run
only on folded ASCII words of at least four letters; other scripts retain literal
and typo matching. Phonetic matching is an approximation, not pronunciation
recognition for every language.

Unqueried name words and completion lengths never lower the score. `ben` gives
Ben Lake and Ben Ocean identical relevance; alphabetical surname, first name,
then numeric ID break ties. Prefix completions Benjamin and Bennett also tie.
Fallback deduplicates people and ranks query-word coverage before closeness.

After match eligibility is settled, authenticated searches apply a final personal
ordering to the entire result set, before pagination (including independent-word
fallback and initials):

1. Closest graduation year to the searcher. Equal gaps prefer the higher year:
   a 2029 searcher sees 2029, 2030, 2028, 2031, 2027.
2. Within each year, closest residential college on the supplied grid. Vertical
   steps cost 1, horizontal steps 0.9, diagonal steps 1.4; distance is the cheapest
   combination of steps across the grid, including empty cells. Stiles is two
   columns right of Pierson and Morse is one column right of Stiles.
3. Equal college distances break alphabetically by college, then retain the
   original name relevance and name/ID tie breakers within that college.

Missing candidate years/colleges sort last for their dimension. When the searcher
has no year or college, that dimension is skipped. Unknown colleges retain same-
college priority but otherwise sort after mapped colleges. General browsing
without a query or birthday filters keeps its existing order. Search suggestions
use the same proximity ordering.
Birthday lists (including the homepage's birthdays today, upcoming birthdays,
and birthday month/date filters) also use this ordering, even without a name
query, before pagination. Equal year/college results then sort by name and ID.
Distances use integer tenths and a tiny per-search college lookup; full-name
matching folds proximity into its existing sort, with no extra candidate query.
One lightweight query fetches the searcher's year/college on a response cache miss.

Only lightweight candidate IDs and name words are fetched for scoring. The
database candidate filter deliberately admits a superset of possible typo matches;
the scorer makes the final decision. No candidate limit silently drops possible
matches. The full ranked ID set is determined before pagination; only the current
page's people and per-user profile data are then fetched.

## Database setup and verification

API startup installs the idempotent `NAME_SEARCH_SETUP_SQL` functions and the
`pg_trgm`, `unaccent`, and `fuzzystrmatch` extensions. If the application role
cannot install extensions, a database administrator must install those extensions
before starting the updated API. No directory data rewrite is needed. See the
PostgreSQL documentation for [unaccent](https://www.postgresql.org/docs/16/unaccent.html)
and [phonetic/edit-distance functions](https://www.postgresql.org/docs/16/fuzzystrmatch.html).

Run the API integration suite on a disposable PostgreSQL database:

```sh
SEARCH_TEST_DATABASE_URL=postgres://... \
OIDC_TEST_DATABASE_URL=postgres://... \
npm run test:integration
```

Search tests cover relative ranking, literal-result stopping, full-name recovery
before fallback, accents and combining marks, compound/preferred/reversed names,
phonetic variations, generated typing mistakes, unrelated queries, safe SQL
handling, inclusion/exclusion/friendship filters, and real-route pagination and
per-user response hydration. Fixtures use temporary tables or an isolated schema
and are removed at cleanup; search functions and extensions remain in the test DB.
