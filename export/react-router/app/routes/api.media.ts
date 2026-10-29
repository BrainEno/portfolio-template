import type { ActionFunctionArgs } from "react-router";
import { handleUpload } from "../portfolio/server/api";

export const action = ({ request }: ActionFunctionArgs) => handleUpload(request);
