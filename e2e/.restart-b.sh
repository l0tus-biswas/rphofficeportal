PID=$(netstat -ano | grep ":5102 .*LISTENING" | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //PID $PID //F >/dev/null 2>&1
sleep 1
export DB=mongodb://localhost:27018/rph_e2e_b
MONGODB_URI=$DB node e2e/seed.js >/dev/null 2>&1
cd backend && (source ../e2e/safe-env.sh; export MONGODB_URI=$DB PORT=5102; nohup node server.js > ../e2e/.backend-b.log 2>&1 &)
sleep 8
