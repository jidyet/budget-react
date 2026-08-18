import { describe, expect, it } from "vitest";
import { getLenderIdentity, LENDER_REGISTRY } from "./lenderRegistry.js";

describe("LENDER-ID: getLenderIdentity - Bank of America aliases", () => {
  it.each(["BOA", "BOFA", "BofA", "Bank of America", "BANK OF AMERICA", "Bank of America Credit Card", "bankofamerica"])(
    "resolves %s to Bank of America",
    (raw) => {
      const result = getLenderIdentity(raw);
      expect(result.matched).toBe(true);
      expect(result.lenderId).toBe("bank_of_america");
      expect(result.canonicalName).toBe("Bank of America");
    }
  );

  // UX-8.4 §53.5: BOA/BOFA/Bank of America must render the identical logo,
  // not three different assets that happen to share a canonical name.
  it("BOA, BOFA, and Bank of America all resolve to the exact same logoAsset reference", () => {
    const boa = getLenderIdentity("BOA");
    const bofa = getLenderIdentity("BOFA");
    const full = getLenderIdentity("Bank of America");
    expect(boa.logoAsset).toEqual(expect.any(String));
    expect(boa.logoAsset).toBe(bofa.logoAsset);
    expect(boa.logoAsset).toBe(full.logoAsset);
  });
});

describe("LENDER-ID: getLenderIdentity - Capital One aliases", () => {
  it.each(["CAPITAL ONE", "Capital One Card Services", "Capital One (Credit Card)", "cap one"])(
    "resolves %s to Capital One",
    (raw) => {
      const result = getLenderIdentity(raw);
      expect(result.matched).toBe(true);
      expect(result.lenderId).toBe("capital_one");
      expect(result.canonicalName).toBe("Capital One");
    }
  );
});

describe("LENDER-ID: getLenderIdentity - U.S. Bank aliases", () => {
  it.each(["US BANK", "U.S. BANK", "U.S. Bank", "USBank", "U S BANK"])(
    "resolves %s to U.S. Bank",
    (raw) => {
      const result = getLenderIdentity(raw);
      expect(result.matched).toBe(true);
      expect(result.lenderId).toBe("us_bank");
      expect(result.canonicalName).toBe("U.S. Bank");
    }
  );
});

describe("LENDER-ID: getLenderIdentity - Wells Fargo aliases", () => {
  it("resolves WELLS FARGO (Line of Credit) to Wells Fargo, stripping the descriptor", () => {
    const result = getLenderIdentity("WELLS FARGO (Line of Credit)");
    expect(result.matched).toBe(true);
    expect(result.lenderId).toBe("wells_fargo");
    expect(result.canonicalName).toBe("Wells Fargo");
  });
});

describe("LENDER-ID: getLenderIdentity - servicers", () => {
  it("resolves MOHELA", () => {
    const result = getLenderIdentity("MOHELA");
    expect(result.matched).toBe(true);
    expect(result.lenderId).toBe("mohela");
    expect(result.canonicalName).toBe("MOHELA");
  });

  it("resolves FIRSTMARK SERVICES", () => {
    const result = getLenderIdentity("FIRSTMARK SERVICES");
    expect(result.matched).toBe(true);
    expect(result.lenderId).toBe("firstmark");
    expect(result.canonicalName).toBe("Firstmark Services");
  });

  it("resolves a bare 'Firstmark' student loan name", () => {
    const result = getLenderIdentity("Firstmark Student Loan");
    expect(result.matched).toBe(true);
    expect(result.lenderId).toBe("firstmark");
  });
});

describe("LENDER-ID: getLenderIdentity - other common lenders present in fixtures", () => {
  it.each([
    ["Chase Freedom", "chase"],
    ["Chase, N.A.", "chase"],
    ["SoFi Personal Loan", "sofi"],
    ["Navy Federal Credit Union", "navy_federal"],
    ["Discover Card", "discover"],
    ["American Express", "american_express"],
    ["Sallie Mae Student Loan", "sallie_mae"],
  ])("resolves %s to lenderId %s", (raw, expectedId) => {
    const result = getLenderIdentity(raw);
    expect(result.matched).toBe(true);
    expect(result.lenderId).toBe(expectedId);
  });
});

describe("LENDER-ID: getLenderIdentity - unknown lender fallback", () => {
  it("falls back to a polished, unmatched identity for a local/unrecognized creditor", () => {
    const result = getLenderIdentity("Family Credit Union Loan");
    expect(result.matched).toBe(false);
    expect(result.lenderId).toBe(null);
    expect(result.matchType).toBe("none");
    expect(result.canonicalName).toBe("Family Credit Union Loan");
    expect(result.initials).toBe("FC");
  });

  it("falls back for other deliberately-unrecognized seed creditors without throwing", () => {
    for (const raw of ["Priceline Card", "Old Store Card", "Samsung Financing", "Jordan Travel Card", "Clinic Payment Plan"]) {
      const result = getLenderIdentity(raw);
      expect(result.matched).toBe(false);
      expect(result.canonicalName).toBe(raw);
      expect(result.initials.length).toBeGreaterThan(0);
    }
  });

  it("never throws and always returns a usable identity for empty/nullish input", () => {
    for (const raw of ["", null, undefined, "   "]) {
      const result = getLenderIdentity(raw);
      expect(result.matched).toBe(false);
      expect(result.canonicalName).toBe("Unknown creditor");
    }
  });
});

// UX-8.3 §33/§51: wrong branding is a trust defect - these prove the
// matcher fails closed rather than fuzzy-matching on a shared substring.
describe("LENDER-ID: getLenderIdentity - false-positive protection", () => {
  it("does not match an unrelated 'capital' creditor to Capital One", () => {
    const result = getLenderIdentity("Capital Grille Dining Card");
    expect(result.matched).toBe(false);
  });

  it("does not match generic 'America' text to Bank of America", () => {
    const result = getLenderIdentity("American Dream Financing LLC");
    expect(result.matched).toBe(false);
  });

  it("does not match 'First Financial' to Firstmark", () => {
    const result = getLenderIdentity("First Financial Credit Union");
    expect(result.matched).toBe(false);
  });

  it("does not match arbitrary 'Navy' text to Navy Federal", () => {
    const result = getLenderIdentity("Navy Surplus Store Card");
    expect(result.matched).toBe(false);
  });

  it("does not match USAA to U.S. Bank", () => {
    const result = getLenderIdentity("USAA");
    expect(result.matched).toBe(false);
  });

  it("does not match 'chase' as a bare substring inside an unrelated word (word-boundary, not substring, matching)", () => {
    // "chase" IS a valid single-word alias for Chase - this proves matching
    // requires a whole WORD, not a bare substring: "purchase" literally
    // contains the letters "chase" but is not the word "chase".
    const result = getLenderIdentity("Purchase Protection Plan");
    expect(result.matched).toBe(false);
  });
});

describe("LENDER-ID: getLenderIdentity - source text preservation and non-merging", () => {
  it("never mutates or discards the original creditor text - canonical name is derived, not destructive", () => {
    const source = "BOFA (Credit Card)";
    const result = getLenderIdentity(source);
    expect(source).toBe("BOFA (Credit Card)");
    expect(result.canonicalName).toBe("Bank of America");
  });

  it("resolves two differently-spelled debts to the same lenderId without implying they are the same account", () => {
    const a = getLenderIdentity("BOFA Card A");
    const b = getLenderIdentity("Bank of America Card B");
    expect(a.lenderId).toBe("bank_of_america");
    expect(b.lenderId).toBe("bank_of_america");
    // Same institution, but this function has no notion of a Debt id at
    // all - it is the caller's job (and every existing caller's job) to
    // keep these as two separate Debt records.
    expect(a).not.toHaveProperty("id");
    expect(a).not.toHaveProperty("debtId");
  });
});

describe("LENDER-ID: registry structure", () => {
  it("every entry has a unique lenderId and at least one alias", () => {
    const ids = new Set();
    for (const entry of LENDER_REGISTRY) {
      expect(ids.has(entry.lenderId)).toBe(false);
      ids.add(entry.lenderId);
      expect(entry.aliases.length).toBeGreaterThan(0);
      expect(entry.canonicalName.length).toBeGreaterThan(0);
    }
  });

  // UX-8.4: only lenders with a verified, provenance-documented local asset
  // (src/assets/lenders/PROVENANCE.md) get a real logoAsset; every other
  // entry stays null and renders the UX-8.3 initials fallback - "a clean
  // fallback is preferable to a questionable asset."
  it("real logoAsset only appears on the verified, provenance-documented lender set", () => {
    const WITH_LOGO = new Set([
      "bank_of_america", "capital_one", "chase", "us_bank", "wells_fargo",
      "citi", "discover", "american_express", "affirm", "sofi", "navy_federal",
    ]);
    for (const entry of LENDER_REGISTRY) {
      if (WITH_LOGO.has(entry.lenderId)) {
        expect(typeof entry.logoAsset).toBe("string");
        expect(entry.logoAsset.length).toBeGreaterThan(0);
      } else {
        expect(entry.logoAsset).toBe(null);
      }
    }
  });

  it("getLenderIdentity surfaces the real logoAsset for a verified lender and null for an unverified one", () => {
    expect(getLenderIdentity("Bank of America").logoAsset).toEqual(expect.any(String));
    expect(getLenderIdentity("MOHELA").logoAsset).toBe(null);
    expect(getLenderIdentity("Family Credit Union Loan").logoAsset).toBe(null);
  });
});
