/**
 * The connection string, from `$MUTEX_DATABASE_URL` and nowhere else.
 *
 * Not from a flag, because an argument lands in shell history and in `ps`
 * output that every user on the machine can read for as long as the process
 * runs. And not from a secret store either: reading one means reimplementing
 * somebody else's file formats and owning a decryption subprocess, which is a
 * great deal of surface for a lock tool to carry.
 *
 * Whatever holds the secret can put it in the environment instead:
 *
 *     MUTEX_DATABASE_URL="$(dotsecenv secret get myapp::DATABASE_URL)" mutex lock x
 *
 * or, interactively, the dotsecenv shell plugin exports it on `cd` and there
 * is nothing to pass at all. A value living under some other name needs no
 * option either, only one assignment:
 *
 *     MUTEX_DATABASE_URL="$LOCKS_URL" mutex lock x
 */
export declare function resolveConnectionString(): string;
