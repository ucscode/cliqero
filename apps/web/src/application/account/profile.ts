import { Account } from "@/modules/identity/account";
import { DuplicateUsernameError, type ProfilePersistence } from "@/modules/identity/persistence";
import { DomainInvariantError, PublicApplicationError } from "@/kernel/errors";
import { normalizeUsername } from "@/modules/identity/username";
export class ProfileService {
  constructor(private readonly persistence: ProfilePersistence) {}
  async get(id: string) {
    const profile = await this.persistence.profileForAccount(id);
    if (!profile?.email)
      throw new PublicApplicationError("Authentication identity not found.", "not_found", 404);
    return {
      email: profile.email,
      username: profile.username,
      displayName: profile.displayName,
      country: profile.country,
    };
  }
  async update(id: string, input: { username?: string; country?: string | null }) {
    const current = await this.persistence.accountForProfileUpdate(id);
    if (!current) throw new PublicApplicationError("Account not found.", "not_found", 404);
    const country = input.country === undefined ? current.country : input.country;
    const normalizedCountry = country === null ? null : country.trim().toUpperCase();
    if (normalizedCountry !== null && !/^[A-Z]{2}$/.test(normalizedCountry))
      throw new DomainInvariantError("Country must be an ISO alpha-2 code", {
        country: "Country must be an ISO alpha-2 code",
      });
    const account = new Account(
      id,
      input.username !== undefined ? normalizeUsername(input.username) : current.username,
      normalizedCountry,
    );
    try {
      await this.persistence.updateProfile(account);
    } catch (error) {
      if (error instanceof DuplicateUsernameError)
        throw new PublicApplicationError("That username is already taken.", "username_taken", 409, {
          username: "That username is already taken.",
        });
      throw error;
    }
    return account;
  }
}
