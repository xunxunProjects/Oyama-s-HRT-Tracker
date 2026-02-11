#!/bin/bash
# Verify Local Admin Login
# Ensure wrangler dev is running on port 8787

echo "Attempting to log in as admin locally..."
RESPONSE=$(curl -s -X POST http://localhost:8787/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}')

echo "Response:"
echo "$RESPONSE"

if [[ $RESPONSE == *"token"* && $RESPONSE == *"isAdmin\":true"* ]]; then
  echo -e "\n\n✅ Admin login successful!"
else
  echo -e "\n\n❌ Admin login failed. Double check .dev.vars and that wrangler dev was restarted."
fi
