export interface ArtifactBinding {path:string;blob:string;sha256:string;event:string}
export interface Selection {
  ordering:string;recovery:string;profilePath:string;profileSha256:string;inputProfiles:Record<string,string>;
  identities:unknown;
}
export interface DecisionManifest {
  schema:"noseq/p1-decision@1";scope:"conditional-selection-requiring-independent-review";
  source:{commit:string;tree:string;base:string};artifacts:ArtifactBinding[];selection:Selection;
  evidence:{path:string;sha256:string;filesSha256:string;context:unknown;kind:"archived-p1d-test-only"|"p1e-closure"};
  requiredCases:string[];decisions:Record<string,string>;
}
export interface DecisionReview {
  schema:"noseq/p1-decision-review@1";scope:"decision-approval";D:string;AD:string;manifestSha256:string;
  source:DecisionManifest["source"];artifacts:ArtifactBinding[];selection:Selection;evidence:DecisionManifest["evidence"];
  requiredCases:string[];decisions:Record<string,string>;findings:string[];summary:string;
}
export interface DecisionExport {
  schema:"noseq/p1-decision-export@1";bundle:{path:string;sha256:string};genesis:string;
  frontier:{head:string;depth:number};source:string;
  chain:{D:string;AD:string;Q:string;P:string;R:string;AR:string}|null;
  evidenceFiles:Record<string,{sha256:string;bytes:number}>;
}
export interface DecisionPolicy {
  schema:"noseq/p1-decision-policy@1";mode:"synthetic-only"|"real-diagnostic";genesis:string;
  principals:{root:string;reviewer:string;implementer:string};minimum:{head:string;depth:number};
  expected:{source:DecisionManifest["source"];paths:string[];selection:Selection;evidence:DecisionManifest["evidence"];
    requiredCases:string[];decisions:Record<string,string>};
}
