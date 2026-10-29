import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { handleSession } from "../portfolio/server/api";

export const loader = ({ request }: LoaderFunctionArgs) => handleSession(request);
export const action = ({ request }: ActionFunctionArgs) => handleSession(request);
