import mysql.connector
import pandas as pd
import os

# Update these with your MySQL credentials or use environment variables.
MYSQL_HOST = os.getenv('MYSQL_HOST', 'localhost')
MYSQL_USER = os.getenv('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'change_me')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'change_me')  # <-- Replace with your actual database name

# Directory containing CSV files
CSV_DIR = 'mysql_tables_csv'

# Table to CSV mapping (if filenames differ from table names, adjust here)
tables = [
    "common_names",
    "family",
    "health_benefits",
    "plant",
    "regions",
    "types",
    "uses"
]

def get_connection():
    return mysql.connector.connect(
        host=MYSQL_HOST,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE
    )

def import_csv_to_table(conn, table_name):
    csv_path = os.path.join(CSV_DIR, f"{table_name}.csv")
    df = pd.read_csv(csv_path)
    cursor = conn.cursor()
    # Build insert statement dynamically
    columns = df.columns.tolist()
    placeholders = ','.join(['%s'] * len(columns))
    col_names = ','.join([f'`{col}`' for col in columns])
    insert_sql = f"INSERT INTO `{table_name}` ({col_names}) VALUES ({placeholders})"
    for row in df.itertuples(index=False, name=None):
        cursor.execute(insert_sql, row)
    conn.commit()
    cursor.close()
    print(f"Imported {csv_path} into {table_name}")

def main():
    conn = get_connection()
    for table in tables:
        import_csv_to_table(conn, table)
    conn.close()

if __name__ == "__main__":
    main()
