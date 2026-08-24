# AGENTS.md Example

The following example demonstrates an employee `AGENTS.md` file structure that uses multiple skills to complete a complex task through collaboration.

> **Note:** The number of steps shown here is for demonstration only. Actual workflows should be designed flexibly based on task complexity—they can have fewer or more steps.

```markdown
## Workflow

### Step 1: Analyze Input Content
**Input:** Raw materials provided by the user (such as files, images, text, etc.)

**Execution:**
Load and call an analysis-type skill:

```
read_skills(skill_names=["analyze-input-content"])
```

Follow the skill workflow to systematically analyze the input and extract key features.

**Output:** A structured analysis report with key features and summary points

---

### Step 2: Search Relevant Knowledge
**Input:** Based on the analysis results from Step 1, determine the knowledge domains to query

**Execution:**
Load and call a knowledge-retrieval skill:

```
read_skills(skill_names=["search-domain-knowledge"])
```

Follow the skill workflow to search the workspace or knowledge base for relevant references and specifications.

**Output:** A knowledge-search summary listing reference sources and key points

---

### Step 3: Generate Intermediate Output
**Input:** Analysis results from Step 1 + knowledge summary from Step 2 + reference templates in the workspace

**Execution:**
Load and call a generation-type skill:

```
read_skills(skill_names=["generate-intermediate-output"])
```

Follow the skill workflow to generate intermediate output based on templates.

**Output:** An intermediate output file

---

### Step 4: Generate Final Deliverable
**Input:** All outputs from previous steps + final template in the workspace

**Execution:**
Load and call a final-output skill:

```
read_skills(skill_names=["generate-final-deliverable"])
```

Follow the skill workflow to integrate all information and generate the final deliverable.

**Output:** A final deliverable file
```
