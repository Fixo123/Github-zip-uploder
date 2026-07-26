# PHP 8.2 + Apache Base Image එක භාවිතා කරන්න
FROM php:8.2-apache

# Server Timezone එක Set කරන්න
ENV TZ=Asia/Colombo

# PHP Extensions Install කරන්න (MySQL, PDO, ZIP, ආදිය - ඔබේ Script එකට අවශ්‍ය නම්)
RUN docker-php-ext-install mysqli pdo pdo_mysql zip \
    && docker-php-ext-enable mysqli

# Apache හි Document Root එකට Code එක Copy කරන්න
COPY . /var/www/html/

# Apache වරාය (Port) 8080 ලෙස වෙනස් කරන්න (Render එකට අවශ්‍ය වන්නේ මෙයයි)
RUN sed -i 's/80/8080/g' /etc/apache2/ports.conf \
    && sed -i 's/:80>/:8080>/g' /etc/apache2/sites-available/000-default.conf

# Directory Permissions Set කරන්න (Apache හට Write කිරීමට ඉඩ දෙන්න)
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Apache හි mod_rewrite සක්‍රිය කරන්න (.htaccess support සඳහා)
RUN a2enmod rewrite

# Port 8080 Expose කරන්න
EXPOSE 8080

# Apache Server Start කරන්න
CMD ["apache2-foreground"]
