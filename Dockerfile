# Lightweight Nginx image එක භාවිතා කරමු
FROM nginx:alpine

# ගොනුව කොපි කරන්න
COPY index.html /usr/share/nginx/html/index.html

# Port 80 expose කරන්න
EXPOSE 80

# Nginx default command එක run වේ
CMD ["nginx", "-g", "daemon off;"]
