import type { AppFile } from "@/types/music";
import db, { COLLECTIONS } from "./db";
import { getId } from "./util";

const getFileExtension = (file: File): string => {
  return file.name.split(".").pop()?.toLowerCase() || "";
};

export const saveFile = async (file: File, fileId?: string) => {
  const ext = getFileExtension(file);
  const id =
    fileId || `${getId()}${ext ? "." + ext : ""}`;

  const newFile: AppFile = {
    id,
    data: file,
    createdAt: new Date(),
  };
  await db.files.add(newFile);
  return newFile;
};

export const deleteFile=(id: string)=> db[COLLECTIONS.FILES_COLLECTION].delete(id)

export const getFile = (id: string) => db.files.get(id);

export const deleteAllFiles = ()=> db[COLLECTIONS.FILES_COLLECTION].clear()
