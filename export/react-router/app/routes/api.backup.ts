import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { handleBackup } from "../portfolio/server/api";

export const loader = ({ request }: LoaderFunctionArgs) => handleBackup(request);
export const action = ({ request }: ActionFunctionArgs) => handleBackup(request);
