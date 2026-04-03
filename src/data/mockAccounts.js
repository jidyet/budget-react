// Bill definitions are stored in Firestore (customAccounts).
// New users see an empty list and add their own bills via Settings.
const MOCK_ACCOUNTS = [];

const CATEGORIES = [
  "CREDIT CARDS","STUDENT LOANS","PERSONAL LOANS","LINE OF CREDIT",
  "INSURANCE","SUBSCRIPTIONS","HOME EXPENSES","UTILITIES","BUSINESS","STORAGE"
];
const CAT_ICON = {
  "CREDIT CARDS":"💳","STUDENT LOANS":"🎓","PERSONAL LOANS":"🤝",
  "LINE OF CREDIT":"🏦","INSURANCE":"🛡️","SUBSCRIPTIONS":"📱",
  "HOME EXPENSES":"🏠","UTILITIES":"⚡","BUSINESS":"💼","STORAGE":"📦",
};
const OWNERS  = ["All"];
const MONTHS  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const FILTERS = ["All","Unpaid","Due this week","Overdue","Paid","High APR (>20%)"];
const DEFAULT_INCOME = [{ src: "EAGLEVIEW", amt: 0 }];

export { MOCK_ACCOUNTS, CATEGORIES, CAT_ICON, OWNERS, MONTHS, FILTERS, DEFAULT_INCOME };
