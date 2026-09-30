# Operator collection sorting

Sortable collection ordering is applied by the collection API/repository, not to
the current page in the browser. Sort controls use semantic labels, remain draft
state until Apply on filtered CRUD pages, and Clear restores the listed default
and the first cursor page. Cursors are deterministic and are valid only for the
sort and direction that produced them.

| Collection           | Sorts                                                                          | Default                                      |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Catalogue listings   | date, title, price, rating                                                     | date descending                              |
| Users / accounts     | created, username                                                              | created descending                           |
| Reviews              | submitted, rating                                                              | submitted descending; status defaults to All |
| Blog posts           | created, title                                                                 | created descending                           |
| Funding              | created, canonical amount                                                      | created descending                           |
| Distributions        | completed date, gross amount                                                   | completed date descending                    |
| Earnings             | created, amount                                                                | created descending                           |
| Withdrawals          | requested date, amount                                                         | requested date descending                    |
| Treasury entries     | created, amount                                                                | created descending                           |
| API keys             | created, name, expiry                                                          | created descending                           |
| Blog categories      | Not sortable: small reference list, already alphabetized, no cursor pagination | alphabetical                                 |
| Catalogue categories | Not sortable: small reference list, already alphabetized, no cursor pagination | alphabetical                                 |

Every SQL ordering field is selected from a fixed allow-list. A deterministic
record ID breaks ties; opaque cursors include the selected field and direction
so they cannot be reused under a different ordering.
