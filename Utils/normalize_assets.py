from pathlib import Path

def normalize_file_names(folder: Path):
    """
    Normalize .gltf, .bin, and main image files in each nested folder:
    - Correct .gltf and .bin filenames: <foldername>.<extension> (e.g., herb0003.gltf)
    - Rename main image <foldername>.jpg to Image_0.jpg
    """
    if not folder.exists() or not folder.is_dir():
        raise SystemExit(f"Folder does not exist: {folder}")

    for subfolder in folder.iterdir():
        if subfolder.is_dir():
            folder_name = subfolder.name.lower()  # e.g., herb0003
            print(f"Processing folder: {folder_name}")

            for file in subfolder.iterdir():
                if file.is_file():
                    ext = file.suffix.lower()  # .gltf, .bin, .jpg, etc.

                    # Normalize .gltf and .bin files
                    if ext in ['.gltf', '.bin']:
                        desired_name = folder_name + ext
                        desired_file = subfolder / desired_name

                        if file.name.lower() == desired_name:
                            continue  # already correct

                        if not desired_file.exists():
                            print(f"Renaming {file.name} -> {desired_name}")
                            file.rename(desired_file)
                        else:
                            new_name = folder_name + "_dup" + ext
                            print(f"Renaming {file.name} -> {new_name}")
                            file.rename(subfolder / new_name)

                    # Rename main folder image to Image_0.jpg
                    elif ext == '.jpg' and file.stem.lower() == folder_name:
                        image_file = subfolder / "Image_0.jpg"
                        if not image_file.exists():
                            print(f"Renaming {file.name} -> Image_0.jpg")
                            file.rename(image_file)
                        else:
                            # If Image_0.jpg exists, use Image_0_dup.jpg
                            new_image = subfolder / "Image_0_dup.jpg"
                            print(f"Renaming {file.name} -> Image_0_dup.jpg")
                            file.rename(new_image)

            # Recursively handle deeper nested folders if any
            normalize_file_names(subfolder)

def main():
    assets1_folder = Path(r"E:\Projects\verdure-repo\Verdure\public\assets1")
    normalize_file_names(assets1_folder)
    print("File normalization complete!")

if __name__ == "__main__":
    main()
