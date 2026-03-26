// Extracted from App.jsx
const MOCK_ACCOUNTS = [
  // CREDIT CARDS
  { id:1,  name:"CAPITAL ONE (Credit Card) (Kristina)",            category:"CREDIT CARDS",   owner:"Kristina", bank:"Capital One",    apr:0.2640, budgeted_min:100,    due_day:3,  starting_bal:1991.99  },
  { id:2,  name:"CHASE (Credit Card) (Kristina)",                  category:"CREDIT CARDS",   owner:"Kristina", bank:"Chase",          apr:0.2774, budgeted_min:40,     due_day:3,  starting_bal:821.47   },
  { id:3,  name:"AMEX (Credit Card Business) (Stallion)",          category:"CREDIT CARDS",   owner:"Stallion", bank:"Amex",           apr:0.0,    budgeted_min:331,    due_day:5,  starting_bal:0        },
  { id:4,  name:"CHASE (CREDIT CARD) (Stallion)",                  category:"CREDIT CARDS",   owner:"Stallion", bank:"Chase",          apr:0.0,    budgeted_min:0,      due_day:6,  starting_bal:0        },
  { id:5,  name:"NAVY FEDERAL (Personal Credit Card) (Kristina)",  category:"CREDIT CARDS",   owner:"Kristina", bank:"Navy Federal",   apr:0.1340, budgeted_min:55,     due_day:7,  starting_bal:5186.90  },
  { id:6,  name:"BOFA (Credit Card) (Babajide)",                   category:"CREDIT CARDS",   owner:"Babajide", bank:"Bank of America", apr:0.2449, budgeted_min:56,     due_day:8,  starting_bal:1915.09  },
  { id:7,  name:"USBANK (Credit Card) (Kristina)",                 category:"CREDIT CARDS",   owner:"Kristina", bank:"US Bank",        apr:0.2449, budgeted_min:172,    due_day:10, starting_bal:4507.06  },
  { id:8,  name:"CAPITAL ONE (Credit Card) (Babajide)",            category:"CREDIT CARDS",   owner:"Babajide", bank:"Capital One",    apr:0.2849, budgeted_min:25,     due_day:14, starting_bal:231.84   },
  { id:9,  name:"DISCOVER (Credit Card) (Babajide)",               category:"CREDIT CARDS",   owner:"Babajide", bank:"Discover",       apr:0.2549, budgeted_min:35,     due_day:20, starting_bal:42.01    },
  { id:10, name:"DISCOVER (Credit Card) (Kristina)",               category:"CREDIT CARDS",   owner:"Kristina", bank:"Discover",       apr:0.2549, budgeted_min:50,     due_day:20, starting_bal:0        },
  { id:11, name:"NAVY FEDERAL (Credit Card) (Babajide)",           category:"CREDIT CARDS",   owner:"Babajide", bank:"Navy Federal",   apr:0.1800, budgeted_min:150,    due_day:20, starting_bal:4116.02  },
  { id:12, name:"BOFA (Credit Card) (Kristina)",                   category:"CREDIT CARDS",   owner:"Kristina", bank:"Bank of America", apr:0.2449, budgeted_min:357,   due_day:0,  starting_bal:11184.44 },
  { id:13, name:"CHASE (Credit Card) (Kristina) 2",               category:"CREDIT CARDS",   owner:"Kristina", bank:"Chase",          apr:0.0,    budgeted_min:200,    due_day:0,  starting_bal:0        },
  { id:14, name:"CITI (Credit Card) (Kristina)",                  category:"CREDIT CARDS",   owner:"Kristina", bank:"Citi",           apr:0.0,    budgeted_min:200,    due_day:0,  starting_bal:0        },
  // STUDENT LOANS
  { id:15, name:"AIDVANTAGE (Student Loan) (Kristina) 1",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:16, name:"AIDVANTAGE (Student Loan) (Kristina) 2",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:17, name:"AIDVANTAGE (Student Loan) (Kristina) 3",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:18, name:"AIDVANTAGE (Student Loan) (Kristina) 4",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:19, name:"AIDVANTAGE (Student Loan) (Kristina) 5",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:20, name:"AIDVANTAGE (Student Loan) (Kristina) 6",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:21, name:"AIDVANTAGE (Student Loan) (Kristina) 7",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:22, name:"AIDVANTAGE (Student Loan) (Kristina) 8",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:23, name:"AIDVANTAGE (Student Loan) (Kristina) 9",         category:"STUDENT LOANS",  owner:"Kristina", bank:"Aidvantage",     apr:0.0,    budgeted_min:0,      due_day:15, starting_bal:0        },
  { id:24, name:"MOHELA (Student Loan) (Kristina)",               category:"STUDENT LOANS",  owner:"Kristina", bank:"MOHELA",         apr:0.0,    budgeted_min:55,     due_day:15, starting_bal:0        },
  { id:25, name:"UTD (Student Loan) (Babajide)",                  category:"STUDENT LOANS",  owner:"Babajide", bank:"UTD",            apr:0.0,    budgeted_min:205.7,  due_day:18, starting_bal:0        },
  { id:26, name:"FIRSTMARK (Student Loan) (Babajide)",            category:"STUDENT LOANS",  owner:"Babajide", bank:"Firstmark",      apr:0.0,    budgeted_min:500,    due_day:21, starting_bal:0        },
  // PERSONAL LOANS
  { id:27, name:"SOFI (Personal Loan) (Babajide)",                category:"PERSONAL LOANS", owner:"Babajide", bank:"SoFi",           apr:0.0862, budgeted_min:255.43, due_day:5,  starting_bal:4023.82  },
  { id:28, name:"SOFI (Personal Loan) (Kristina)",                category:"PERSONAL LOANS", owner:"Kristina", bank:"SoFi",           apr:0.0,    budgeted_min:707,    due_day:20, starting_bal:0        },
  { id:29, name:"AFFIRM (Apple) (Babajide)",                      category:"PERSONAL LOANS", owner:"Babajide", bank:"Affirm",         apr:0.0,    budgeted_min:200,    due_day:29, starting_bal:0        },
  { id:30, name:"AFFIRM (Samsung) (Babajide)",                    category:"PERSONAL LOANS", owner:"Babajide", bank:"Affirm",         apr:0.0,    budgeted_min:100,    due_day:28, starting_bal:0        },
  { id:31, name:"AFFIRM Priceline (Personal Loan) (Babajide)",    category:"PERSONAL LOANS", owner:"Babajide", bank:"Affirm",         apr:0.0,    budgeted_min:271.07, due_day:30, starting_bal:0        },
  // LINE OF CREDIT
  { id:32, name:"WELLS FARGO (Line of Credit) (Stallion)",        category:"LINE OF CREDIT", owner:"Stallion", bank:"Wells Fargo",    apr:0.0,    budgeted_min:0,      due_day:13, starting_bal:4553.22  },
  { id:33, name:"USBANK (Line of Credit) (Kristina)",             category:"LINE OF CREDIT", owner:"Kristina", bank:"US Bank",        apr:0.1275, budgeted_min:100,    due_day:15, starting_bal:4502.13  },
  { id:34, name:"CHASE (Line of Credit) (Stallion)",              category:"LINE OF CREDIT", owner:"Stallion", bank:"Chase",          apr:0.0,    budgeted_min:0,      due_day:21, starting_bal:0        },
  // INSURANCE
  { id:35, name:"Tommy (Globe Life Insurance)",                   category:"INSURANCE",      owner:"Babajide", bank:"Globe Life",     apr:0.0,    budgeted_min:100.78, due_day:3,  starting_bal:0        },
  { id:36, name:"AJ (New York Life)",                             category:"INSURANCE",      owner:"Babajide", bank:"NY Life",        apr:0.0,    budgeted_min:50,     due_day:9,  starting_bal:0        },
  { id:37, name:"CAR (Auto Insurance)",                           category:"INSURANCE",      owner:"Babajide", bank:"Progressive",    apr:0.0,    budgeted_min:142.33, due_day:10, starting_bal:0        },
  { id:38, name:"Jide (New York Life Insurance)",                 category:"INSURANCE",      owner:"Babajide", bank:"NY Life",        apr:0.0,    budgeted_min:114.24, due_day:12, starting_bal:0        },
  { id:39, name:"Kristina (New York Life Insurance)",             category:"INSURANCE",      owner:"Kristina", bank:"NY Life",        apr:0.0,    budgeted_min:69,     due_day:12, starting_bal:0        },
  { id:40, name:"Dad (Trustage) (Life Insurance)",                category:"INSURANCE",      owner:"Babajide", bank:"Trustage",       apr:0.0,    budgeted_min:66.38,  due_day:14, starting_bal:0        },
  { id:41, name:"Mike (Globe Life Insurance)",                    category:"INSURANCE",      owner:"Babajide", bank:"Globe Life",     apr:0.0,    budgeted_min:38.25,  due_day:16, starting_bal:0        },
  { id:42, name:"Dad (New York Life Insurance)",                  category:"INSURANCE",      owner:"Babajide", bank:"NY Life",        apr:0.0,    budgeted_min:158,    due_day:17, starting_bal:0        },
  { id:43, name:"Uncle James (Globe Life Insurance)",             category:"INSURANCE",      owner:"Babajide", bank:"Globe Life",     apr:0.0,    budgeted_min:91.9,   due_day:30, starting_bal:0        },
  // SUBSCRIPTIONS
  { id:44, name:"Walmart Plus (Subscription)",                    category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"Walmart",        apr:0.0,    budgeted_min:12.95,  due_day:18, starting_bal:0        },
  { id:45, name:"Amazon PRIME (Subscription)",                    category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"Amazon",         apr:0.0,    budgeted_min:16.23,  due_day:22, starting_bal:0        },
  { id:46, name:"SAMSUNG",                                        category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"Samsung",        apr:0.0,    budgeted_min:12.98,  due_day:23, starting_bal:0        },
  { id:47, name:"PEACOCK (Subscription)",                         category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"Peacock",        apr:0.0,    budgeted_min:11.9,   due_day:26, starting_bal:0        },
  { id:48, name:"DISNEY/HULU/ESPN (Subscription)",                category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"Disney",         apr:0.0,    budgeted_min:27,     due_day:29, starting_bal:0        },
  { id:49, name:"YTMUSIC (Subscription)",                         category:"SUBSCRIPTIONS",  owner:"Babajide", bank:"YouTube",        apr:0.0,    budgeted_min:18.99,  due_day:30, starting_bal:0        },
  // HOME EXPENSES
  { id:50, name:"RENT (318 Antler Ct) (Home Expense)",            category:"HOME EXPENSES",  owner:"Babajide", bank:"Landlord",       apr:0.0,    budgeted_min:2300,   due_day:1,  starting_bal:0        },
  { id:51, name:"SCHOOL FEES (Home Expense)",                     category:"HOME EXPENSES",  owner:"Babajide", bank:"School",         apr:0.0,    budgeted_min:345,    due_day:2,  starting_bal:0        },
  { id:52, name:"PHONE Tmobile (Home Expense)",                   category:"HOME EXPENSES",  owner:"Babajide", bank:"T-Mobile",       apr:0.0,    budgeted_min:148.05, due_day:20, starting_bal:0        },
  { id:53, name:"INTERNET (Frontier)",                            category:"HOME EXPENSES",  owner:"Babajide", bank:"Frontier",       apr:0.0,    budgeted_min:64.99,  due_day:26, starting_bal:0        },
  { id:54, name:"RENTERS INSURANCE (State Farm)",                 category:"HOME EXPENSES",  owner:"Babajide", bank:"State Farm",     apr:0.0,    budgeted_min:0,      due_day:10, starting_bal:0        },
  { id:55, name:"GAS Vehicle (Home Expense)",                     category:"HOME EXPENSES",  owner:"Babajide", bank:"Gas",            apr:0.0,    budgeted_min:300,    due_day:0,  starting_bal:0        },
  { id:56, name:"GROCERIES (Home Expense)",                       category:"HOME EXPENSES",  owner:"Babajide", bank:"Groceries",      apr:0.0,    budgeted_min:500,    due_day:0,  starting_bal:0        },
  { id:57, name:"HOUSEHOLD ADVANCE (Home Expense)",               category:"HOME EXPENSES",  owner:"Babajide", bank:"Household",      apr:0.0,    budgeted_min:0,      due_day:0,  starting_bal:0        },
  { id:58, name:"RESTAURANTS (Home Expense)",                     category:"HOME EXPENSES",  owner:"Babajide", bank:"Restaurants",    apr:0.0,    budgeted_min:0,      due_day:0,  starting_bal:0        },
  { id:59, name:"TOLL SERVICE (Home Expense)",                    category:"HOME EXPENSES",  owner:"Babajide", bank:"Toll",           apr:0.0,    budgeted_min:0,      due_day:0,  starting_bal:0        },
  // UTILITIES
  { id:60, name:"SEWER/TRASH/WATER (Utility)",                    category:"UTILITIES",      owner:"Babajide", bank:"City",           apr:0.0,    budgeted_min:88.78,  due_day:2,  starting_bal:0        },
  { id:61, name:"ELECTRICITY Trieagle Energy (Utility)",          category:"UTILITIES",      owner:"Babajide", bank:"Trieagle",       apr:0.0,    budgeted_min:144,    due_day:13, starting_bal:0        },
  { id:62, name:"GAS (Atmos Energy)",                             category:"UTILITIES",      owner:"Babajide", bank:"Atmos",          apr:0.0,    budgeted_min:290.4,  due_day:26, starting_bal:0        },
  // BUSINESS
  { id:63, name:"NAVY FEDERAL (Business) (Kristina)",             category:"BUSINESS",       owner:"Kristina", bank:"Navy Federal",   apr:0.1290, budgeted_min:54.16,  due_day:16, starting_bal:2540.69  },
  { id:64, name:"USBANK (Business) (Kristina)",                   category:"BUSINESS",       owner:"Kristina", bank:"US Bank",        apr:0.2649, budgeted_min:169,    due_day:22, starting_bal:5218.68  },
  // STORAGE
  { id:65, name:"CONTAINER STORAGE (Business) (Stallion)",        category:"STORAGE",        owner:"Stallion", bank:"Storage Co",     apr:0.0,    budgeted_min:100,    due_day:1,  starting_bal:0        },
  { id:66, name:"MO STORAGE (Public Storage Business) (Stallion)",category:"STORAGE",        owner:"Stallion", bank:"Public Storage", apr:0.0,    budgeted_min:100,    due_day:3,  starting_bal:0        },
  { id:67, name:"TX STORAGE (Extra Storage Business) (Stallion)", category:"STORAGE",        owner:"Stallion", bank:"Extra Storage",  apr:0.0,    budgeted_min:157,    due_day:9,  starting_bal:0        },
];

const CATEGORIES = [
  "CREDIT CARDS","STUDENT LOANS","PERSONAL LOANS","LINE OF CREDIT",
  "INSURANCE","SUBSCRIPTIONS","HOME EXPENSES","UTILITIES","BUSINESS","STORAGE"
];
const CAT_ICON = {
  "CREDIT CARDS":"💳","STUDENT LOANS":"🎓","PERSONAL LOANS":"🤝",
  "LINE OF CREDIT":"🏦","INSURANCE":"🛡️","SUBSCRIPTIONS":"📱",
  "HOME EXPENSES":"🏠","UTILITIES":"⚡","BUSINESS":"💼","STORAGE":"📦",
};
const OWNERS  = ["All","Babajide","Kristina","Stallion"];
const MONTHS  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const FILTERS = ["All","Unpaid","Due this week","Overdue","Paid","High APR (>20%)"];
const DEFAULT_INCOME = [{ src: "EAGLEVIEW", amt: 0 }];

export { MOCK_ACCOUNTS, CATEGORIES, CAT_ICON, OWNERS, MONTHS, FILTERS, DEFAULT_INCOME };
