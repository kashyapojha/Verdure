FROM mysql:8.0

# Set environment variables
ENV MYSQL_ROOT_PASSWORD="nbh05@"
ENV MYSQL_DATABASE="project"

# Copy the backup file into the auto-init directory
# MySQL will automatically run this into the MYSQL_DATABASE
COPY verdure_backup_utf8.sql /docker-entrypoint-initdb.d/

EXPOSE 3306