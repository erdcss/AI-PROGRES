import csv

def fix_csv_quotes(input_file, output_file):
    with open(input_file, mode="r", encoding="utf-8", errors="ignore") as infile, \
         open(output_file, mode="w", newline="", encoding="utf-8") as outfile:
        reader = csv.reader(infile)
        writer = csv.writer(outfile, quoting=csv.QUOTE_MINIMAL)

        for row in reader:
            cleaned = [col.replace('"', '').replace("'", "") for col in row]
            writer.writerow(cleaned)

input_path = "products.csv"         # düzenlenecek dosya
output_path = "fixed_products.csv"  # yeni temiz dosya

fix_csv_quotes(input_path, output_path)
print(f"Düzenlendi: {output_path}")