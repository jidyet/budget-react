// DATA-2 synthetic fixture: reproduces the structural pattern of a real
// Capital One credit card statement using ONLY the exact numeric values the
// DATA-2 task spec itself provides (safe to use - it volunteers them as
// expected test values). "Kristina K Davis" is the same synthetic test
// persona already reused throughout this codebase's test fixtures
// (v2SeedData.js, ownership.test.js, etc.), not a real person. No real
// personal document was read or copied to build this.
export const CAPITAL_ONE_STATEMENT_TEXT = `
CAPITAL ONE
Quicksilver Credit Card
World Elite Mastercard

KRISTINA K DAVIS
123 MAIN ST
ANYTOWN ST 12345

Account ending in 2656

Statement Period 12/10/2025 to 01/09/2026
Payment Due Date 02/03/2026

Previous Balance $2,046.12
Amount Paid $100.00
New Balance $1,991.99

Minimum Payment Due $65.00

Credit Limit $5,100.00
Available Credit $3,108.01

Interest Charged $45.87

Interest Charge Calculation
Type of Balance APR Balance Subject to Interest Rate Interest Charged
Purchases 26.40% 2045.73 45.87
Cash Advances 28.40% 0.00 0.00

Minimum Payment Warning: If you make only the minimum payment each period, you will pay more in interest and it will take you longer to pay off your balance. For example:

If you make no additional charges using this card and each month you pay...

Only the minimum payment
You will pay off the balance shown on this statement in about 17 Years and you will end up paying an estimated total of $5,847 (including interest)

$81
You will pay off the balance shown on this statement in about 3 Years and you will save an estimated $2,942 (that is because you will pay less interest)
`;
