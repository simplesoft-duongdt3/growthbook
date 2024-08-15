import React, {
  DetailedHTMLProps,
  HTMLAttributes,
  ReactElement,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";
import { Screenshot } from "back-end/types/experiment";
import clsx from "clsx";
import { BiImageAdd } from "react-icons/bi";
import { useAuth } from "@front-end/services/auth";
import { uploadFile } from "@front-end/services/files";
import LoadingOverlay from "@front-end/components/LoadingOverlay";
import styles from "./ScreenshotUpload.module.scss";

type props = {
  experiment: string;
  variation: number;
  onSuccess: (variation: number, screenshot: Screenshot) => void;
};

const ScreenshotUpload = ({
  experiment,
  variation,
  onSuccess,
}: props): ReactElement => {
  const { apiCall } = useAuth();
  const [loading, setLoading] = useState(0);

  const onDrop = async (files: File[]) => {
    setLoading((previous) => previous + files.length);

    for (const file of files) {
      try {
        const { fileURL } = await uploadFile(apiCall, file);

        await apiCall(
          `/experiment/${experiment}/variation/${variation}/screenshot`,
          {
            method: "PUT",
            body: JSON.stringify({
              url: fileURL,
              // TODO: allow customizing description
              description: "",
            }),
          }
        );

        setLoading((previous) => previous - 1);

        onSuccess(variation, {
          path: fileURL,
          description: "",
        });
      } catch (e) {
        alert(e.message);
        setLoading((previous) => previous - 1);
      }
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // getRootProps assumes generic HTMLElement, but we're using HTMLDivElement
  const rootProps: unknown = getRootProps();
  const typedRootProps = rootProps as DetailedHTMLProps<
    HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >;

  return (
    <>
      <div
        {...typedRootProps}
        className={clsx(styles.droparea, "my-1", {
          [styles.dragging]: isDragActive,
        })}
      >
        {loading > 0 ? <LoadingOverlay /> : ""}
        <input {...getInputProps()} />
        <div className={styles.message}>Drop Image Here...</div>
        <span className={styles.textlink}>
          <BiImageAdd className="mr-1" style={{ fontSize: 20 }} />
          Add Screenshot
        </span>
      </div>
    </>
  );
};

export default ScreenshotUpload;
